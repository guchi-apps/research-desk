# アーキテクチャ概要

このリポジトリの初期化（#1）で決めた構成のメモ。以降のIssueで機能を足すときの前提として参照する。

## 技術スタック

`guchi-apps/docs` の `standards/tech-stack.md` に沿う。Next.js 16 App Router + React 19 +
TypeScript + Tailwind CSS v4 + Prisma 6（MariaDB）+ Supabase Auth（Google）。

- Prisma は7系ではなく6系に固定している（7系はdriver adapterが必須になり、既存アプリと構成が
  分かれるため）
- shadcn/ui・Framer Motionは初期化時点では導入していない。UIが複雑になった時点で必要なら足す

## 認証（Supabase Auth）

ルート構成は他アプリ（car-care・asset-manager・db-console）と揃えている
（同一セグメントに`page.tsx`と`route.ts`を共存できないため）。

| パス | 役割 |
|---|---|
| `/login` | ログイン画面（`/auth/signin`への素のリンクのみ。JS不要） |
| `/auth/signin` | Route Handler。サーバー側でOAuth認可URLを組み立てて302 |
| `/auth/callback` | Route Handler。`code`をセッションと交換し`/dashboard`へ |
| `/auth/signout` | Route Handler（POST）。セッションを破棄し`/login`へ |
| `/api/dev/login` | CI・ローカル開発専用のバイパス（`NODE_ENV!=="production"`かつ`CI_LOGIN_BYPASS_SECRET`設定時のみ有効） |

- `src/proxy.ts`（Next.js 16の`middleware.ts`相当）は`/dashboard`配下だけを保護対象にしている。
  全経路を対象にすると静的アセット（アイコン等）の除外漏れを踏みやすいため、保護範囲を絞って
  回避した
- ログイン可否は `ALLOWED_GOOGLE_EMAILS`（カンマ区切り）で絞る。DBにユーザーテーブルは持たない
- `src/lib/auth.ts` の `getCurrentUser()` は「未ログイン」と「Supabaseへ疎通できず今は確認できない
  （`AuthRetryableFetchError` / 429）」を区別する。後者をログイン画面へ差し戻すと、電波の悪い
  場所で開いただけの利用者がログインし直しになるため

### リダイレクト先のoriginは`request.url`から作らない

**Next.js 16の`request.url`は待受アドレス（`http://localhost:<PORT>`）を返し、ブラウザが送った
`Host`ヘッダーを反映しない。** `next dev -p 27014`に`Host: research-desk.gucchii.com`を付けて
リクエストしても`request.url`は`localhost:27014`のままになる（#14で実測）。

そのため`new URL(request.url).origin`でoriginを組み立てると、Apacheのリバースプロキシ配下に
ある本番では`https://localhost:3115`になる。Supabaseへ渡す`redirect_to`がこの値になると、
Redirect URLsに載っていないURLとして扱われ、GoTrueはSite URL（`https://gucchii.com/`）へ
フォールバックする。利用者からは**ログインすると`https://gucchii.com/?error=invalid_request&
error_code=flow_state_already_used`へ飛ばされる**という形で見える。

外部へ渡すURL・リダイレクト先は`src/lib/request-origin.ts`の`getRequestOrigin()`で組み立てる。
`Host`（Apacheの`ProxyPreserveHost On`で保持）と`X-Forwarded-Proto`から作る形で、
car-care・db-consoleと同じ。`?next=`のようなクエリ由来の戻り先は同ファイルの`safeNextPath()`を
通す（`//evil.example`はブラウザに別オリジンとして解釈されるため、先頭が`/`かどうかだけでは
オープンリダイレクトを防げない）。

## データベース

`Clip` は汎用クリップの配線確認用として残し、業界情報は `IndustryInformation` に分離する。
業界情報には `DELIVERY`（宅配）または `LOCKER`（ロッカー）を必須で持たせ、情報区分、重要度、
公開日／発生日、収集日時、本文、要約、取得数値、企画への示唆、対象企業・商品、キーワード／タグ、
対象期間の区分を保存する。数値とキーワード／タグは、後続の収集処理で項目が増えても移行なしで
保持できるよう JSON とする。

元 URL は `originalUrl` に保持し、収集処理が計算した URL 正規化値 (`normalizedUrl`) と SHA-256
ハッシュ (`urlHash`) に一意制約を付ける。同じ URL の登録は DB で拒否する。同一発表が別 URL で
転載された場合は、一次情報を代表レコードとして `canonicalId` で関連付ける。一次情報かどうかは
`isPrimarySource` で明示し、元 URL と情報源を失わない。

事業区分・情報区分、重要度・公開日、対象期間・公開日、転載グループには複合／検索用インデックスを
付けている。これにより、後続の検索・フィルター・週報生成は公開日を基準に必要な情報を絞り込める。

## AIDE向けサーバー間連携API（週報登録）

`POST /api/internal/weekly-report` は、AIDEのMCPツール
（`aide_research_desk_import_weekly_report`）から週報を受け取るNode.js Route Handler（#31）。

当初（#27）はChatGPTが直接繋ぐ独立MCPサーバー（`/api/mcp`）として作ったが、静的Bearer認証の
独立MCPはChatGPT側のMCP認証方式と運用が合わず、アプリごとにChatGPT接続を増やすことにもなる。
既にChatGPTと接続・認証済みのAIDEを共通窓口にする方針へ変え、`/api/mcp`（JSON-RPCの
`initialize`・`tools/list`・`tools/call`）は削除した。ChatGPTはAIDEまでしか繋がらないため、
Research Deskの認証情報はChatGPTへ露出しない。

認証は`src/lib/internal-auth.ts`の`requireInternalApiKey()`で、環境変数`INTERNAL_API_KEY`との
タイミングセーフ比較1本。**未設定のときは素通りではなく503を返す**——設定漏れがそのまま
認証なしの公開に化けるのを防ぐ。不一致は401。パス・環境変数名はフリートの他アプリ
（dayspan・myroom・subscription-lists・ops-dashboard）の`/api/internal/*` + `INTERNAL_API_KEY`に
揃えてあり、AIDE側も`AIDE_<APP>_URL` / `AIDE_<APP>_TOKEN`で揃う。呼び出し元は同一VPS上のAIDE
（`127.0.0.1`）だけを想定しており、外部公開は要らない。`src/proxy.ts`のmatcherは`/dashboard`
配下だけなので、このパスはSupabaseへ問い合わせずに素通しされる。

週報の登録は`src/lib/collection.ts`の`importWeeklyReport()`が担当する（#27から流用）。1回あたり
全体6件、各事業3件までを入力検証し、`normalizedUrl`の事前確認とDBの一意制約（競合時はP2002）で
再送を重複として処理する。登録結果は`CollectionRun`に保存し、新規・重複件数と`DELIVERY`／
`LOCKER`別の件数を返す。レート制限はプロセス内で認証済みクライアントごとに1分20回までとするため、
複数プロセス環境ではリバースプロキシ側の制限も併用する。シークレットと入力本文はログへ出さない。

初回マイグレーション（`prisma/migrations/20260830000000_init/`）は、CI環境にライブDBが無い状態で
`pnpm exec prisma migrate diff --from-empty --to-schema-datamodel=prisma/schema.prisma --script`
を使って生成した（`prisma migrate dev`と違いDB接続を必要としない）。

## 業界ニュース画面（`/dashboard`）

画面は`industry_information`の表示専用で、書き込みはAIDE経由の`POST /api/internal/weekly-report`
だけが行う（#32）。クエリの組み立てと表示用の整形は`src/lib/industry-information.ts`に置き、
`src/app/dashboard/page.tsx`はその結果を描くだけにしてある。1週ぶんは全体6件・各事業3件までなので、
絞り込み後の件数はそのまま描画してよい大きさに収まる。

### 週の区切りはJSTの月曜0時

`?week=`は今週を`0`とするオフセットで、`-8`まで遡れる。週の範囲は**JST（UTC+9）の月曜0時**から
7日間で、サーバーのタイムゾーン設定に結果を左右させないため`Date`のローカルメソッドは使わず、
オフセットを足してUTCとして扱う（`getWeekRange()`）。

どの週に出すかは公開日（`publishedAt`）で決める。ただし例外が2つある。

- **補足（`periodScope=PAST_30_DAYS_SUPPLEMENT`）は収集日（`collectedAt`）の週に出す。** 補足は
  過去30日から拾った記事で、公開日は対象週より前になる。公開日で絞ると「その週の週報として
  登録したのに画面に出てこない」になるため、登録した週に出す
- 公開日が未設定の記事も収集日の週に出す（どの週にも出てこなくなるため）

そのため、週報を「先週ぶん」として登録すると、本体の記事は先週・補足は登録した週に分かれて出る。
記事を収集ラン（`CollectionRun`）に紐付ければ対象期間で揃えられるが、スキーマ変更が要るため
#32では行っていない。

### 絞り込みはクエリ側で行う

事業区分・情報区分（`isPrimarySource`）・重要度・キーワードは、すべてPrismaの`where`へ渡す。
並び順はMySQL/MariaDBのENUMが**定義順**で並ぶ性質に乗せており、`periodScope`（IN_SCOPE→補足）・
`importance`（HIGH→MEDIUM→REFERENCE）をそのまま`asc`で指定すると「補足は後ろ・重要度順」になる
（`prisma/migrations/*/migration.sql`のENUM定義順が正）。

キーワードは、文字列列（タイトル・要約・対象企業・対象商品・情報源・発行元）が**部分一致**、
JSON列の`keywords`・`tags`が**要素の完全一致**（`array_contains` = `JSON_CONTAINS`）になる。
Prismaが出せるJSON列の条件が完全一致までのためで、`ロッカー`では`ロッカー事業`というタグに
当たらない。タグは登録時の語をそのまま入れる前提で使う。

## CI撮影の認証バイパス

`24.screenshot-required`向け。`/api/dev/login`にアクセスするとCookieが発行され、`src/proxy.ts`と
`src/lib/auth.ts`の両方がそのCookieを検証する（片方だけだとデータが引けず画面が空になるため対で
実装している）。ダミーデータは `pnpm db:seed:ci`（`prisma/seed-ci.mjs`）で投入する。
