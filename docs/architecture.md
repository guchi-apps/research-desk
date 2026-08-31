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
| `/auth/callback` | Route Handler。`code`をセッションと交換し`/`（トップ画面）へ |
| `/auth/signout` | Route Handler（POST）。セッションを破棄し`/login`へ |
| `/api/dev/login` | CI・ローカル開発専用のバイパス（`NODE_ENV!=="production"`かつ`CI_LOGIN_BYPASS_SECRET`設定時のみ有効） |

- `src/proxy.ts`（Next.js 16の`middleware.ts`相当）はトップ画面（`/`）と`/dashboard`配下だけを
  保護対象にしている。全経路を対象にすると静的アセット（アイコン等）の除外漏れを踏みやすいため、
  保護範囲を絞って回避した（`matcher: ["/", "/dashboard/:path*"]`）
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

**`?next=`未指定時の既定の遷移先は`safeNextPath()`の`fallback`引数1箇所で管理している**（#42）。
`/auth/callback`・`/auth/signin`・`/api/dev/login`の3ルートがこの関数を共通で呼んでおり、
ログイン後の既定の遷移先を変える（例: トップ画面を追加してそちらへ変える）ときは、この1箇所を
直せば3ルートすべてに一貫して効く。ルートごとに個別のフォールバック値を持たせていないため、
一部のルートだけ直し忘れるということが起きない。

## データベース

`Clip` は汎用クリップの配線確認用として残し、業界情報は `IndustryInformation` に分離する。
業界情報には `DELIVERY`（宅配）または `LOCKER`（ロッカー）を必須で持たせ、情報区分、重要度、
公開日／発生日、収集日時、本文、要約、取得数値、企画への示唆、対象企業・商品、キーワード／タグ、
対象期間の区分を保存する。数値とキーワード／タグは、後続の収集処理で項目が増えても移行なしで
保持できるよう JSON とする。

元 URL は `originalUrl` に保持し、収集処理が計算した URL 正規化値 (`normalizedUrl`) と SHA-256
ハッシュ (`urlHash`) に一意制約を付ける。同じ URL の登録は DB で拒否する。一次情報かどうかは
`isPrimarySource` で明示し、元 URL と情報源を失わない。

同一発表が別 URL で配信された場合の統合は、`mergedSources`（統合元 URL の JSON 配列）・
`updateReason`（直近の更新理由）・`updatedByRunId`（最後に統合・更新した `CollectionRun`）で
表現する（#43）。`canonicalId`/`canonical`/`relatedReprints` はこの用途と重複し、かつ表示側
（`listIndustryInformation()`・`dashboard/page.tsx`）で一切参照されず実効性が無かったため、
**#43 以降は書き込みに使わない**（過去データ互換のため列・リレーションのみ残す）。

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
全体6件、各事業3件までを入力検証する。記事の取り込みは`upsertIndustryInformationEvent()`（#43。
自動収集の`runDailyCollection()`とも共通）に委ね、完全URL一致は従来どおり冪等に扱い、URLが
異なっていても同一イベントと判定した記事は新規作成せず既存記事へ統合・上書き更新する。登録結果は
`CollectionRun`に保存し、新規・統合更新・重複・除外の件数と`DELIVERY`／`LOCKER`別の件数を返す
（`mergedCount`・`excludedCount`はレスポンスへの追加フィールドで、AIDE側の契約は後方互換）。
レート制限はプロセス内で認証済みクライアントごとに1分20回までとするため、複数プロセス環境では
リバースプロキシ側の制限も併用する。シークレットと入力本文はログへ出さない。

初回マイグレーション（`prisma/migrations/20260830000000_init/`）は、CI環境にライブDBが無い状態で
`pnpm exec prisma migrate diff --from-empty --to-schema-datamodel=prisma/schema.prisma --script`
を使って生成した（`prisma migrate dev`と違いDB接続を必要としない）。

**2回目以降の増分マイグレーションも、DB接続なしで生成できる。** `--from-migrations`は
シャドウDBを要求するので使わず、**変更前のスキーマをgitから取り出して`--from-schema-datamodel`に
渡す**（#37）。ローカルに`.env.local`が無い環境でも生成でき、`prisma migrate dev`のように
開発用DBを作らずに済む。

```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-old.prisma
pnpm exec prisma migrate diff --from-schema-datamodel /tmp/schema-old.prisma \
  --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql
```

出力先はリダイレクトで作る（`prisma.config.ts`の`quiet: true`が効いているのでstdoutにSQL以外は
混ざらない。混ざったときの実害は`guchi-apps/aide-bot#9`）。**`2>&1`でstderrも一緒にリダイレクト
すると、`Loaded Prisma config from prisma.config.ts.`やアップデート通知のバナーがSQLファイルへ
混入する**（#43で実際に発生し、`prisma/migrations/20260831120000_daily_event_merge_and_weekly_cap/`
を作り直した）。`> file`だけにし、`2>&1`は付けない。

## トップ画面（`/`, #42）

ログイン後の最初の画面。直近で収集された業界情報（`IndustryInformation`）を`collectedAt`降順で
最大`RECENT_LIMIT`（10）件取得し、JSTの日付基準で「今日」「昨日」「それ以前」に区分して表示する
（`src/lib/industry-information.ts`の`listRecentIndustryInformation()`・`getRecencyLabel()`）。

収集は週1回程度の想定（`COLLECTION_LIMIT`は1回6件）のため、「今日・昨日」だけに絞ると大半の日は
空になる。そのため常に直近の記事を件数上限で取得し、区分ラベルは表示上の見出しとしてのみ使う
（0件になる区分の見出しは出さない）。

業界ニュース画面（`/dashboard`）への遷移はこの画面からのリンク（サイドバーnav・CTA）のみで、
事業別の絞り込みや週送りはこれまでどおり`/dashboard`が担う。

## 業界ニュース画面（`/dashboard`）

画面は`industry_information`の表示専用で、書き込みはAIDE経由の`POST /api/internal/weekly-report`
だけが行う（#32）。クエリの組み立てと表示用の整形は`src/lib/industry-information.ts`に置き、
`src/app/dashboard/page.tsx`はその結果を描くだけにしてある。1週ぶんは全体6件・各事業3件までなので、
絞り込み後の件数はそのまま描画してよい大きさに収まる。

### 週の区切りはJSTの日曜0時

`?week=`は今週を`0`とするオフセットで、`-8`まで遡れる。週の範囲は**JST（UTC+9）の日曜0時**から
7日間で（#43。それ以前は月曜0時始まりだった）、サーバーのタイムゾーン設定に結果を左右させない
ため`Date`のローカルメソッドは使わず、オフセットを足してUTCとして扱う（`getWeekRange()`）。
境界変更にともなう既存データの再集計・移行は不要（`weekCondition()`は公開日・収集ランの期間
重なりで判定するロジックのままで、境界がずれるだけのため）。`weekCondition()`は
`src/lib/collection.ts`のイベント統合・週あたり上限判定からも再利用する。

どの週に出すかは公開日（`publishedAt`）で決める。ただし例外が2つある。

- **補足（`periodScope=PAST_30_DAYS_SUPPLEMENT`）は、登録した収集ラン（`CollectionRun`）の
  対象期間が重なる週に出す。** 補足は過去30日から拾った記事で、公開日は対象週より前になる。
  公開日で絞ると「その週の週報として登録したのに画面に出てこない」になる
- 公開日が未設定の記事も同じく収集ランの対象期間で出す（どの週にも出てこなくなるため）

`IndustryInformation.collectionRunId`は`importWeeklyReport()`・`runDailyCollection()`（#43で
`runWeeklyCollection()`から改名）が登録時に埋める（#37）。これで「1回の週報として登録した記事」が
本体・補足そろって同じ週に出る。判定は**期間の重なり**（`targetFrom < 週の終わり` かつ
`targetTo > 週の始まり`）で、`targetTo`が翌週の日曜0時ちょうどでも翌週へはみ出さない。逆に、対象
期間が週境界をまたぐラン（`importWeeklyReport()`がAIDEから複数週にまたがる期間を受け取った場合
など）では補足が隣り合う2週の両方に出る——本体の記事も公開日で2週へ分かれるため、揃えるという
目的とは整合する。`runDailyCollection()`は#43で`targetFrom`を「今週の開始」に固定したため、
このラン自体が週境界をまたぐことは無い。

**収集ランに紐付いていない記事（#37より前に登録したもの）は、従来どおり収集日（`collectedAt`）の
週で拾う。** 移行データは作っていないので、この分岐を消すと過去の補足が画面から消える。

### 絞り込みはクエリ側で行う

事業区分・情報区分（`isPrimarySource`）・重要度・キーワードは、すべてPrismaの`where`へ渡す。
並び順はMySQL/MariaDBのENUMが**定義順**で並ぶ性質に乗せており、`periodScope`（IN_SCOPE→補足）・
`importance`（HIGH→MEDIUM→REFERENCE）をそのまま`asc`で指定すると「補足は後ろ・重要度順」になる
（`prisma/migrations/*/migration.sql`のENUM定義順が正）。

キーワードは、文字列列（タイトル・要約・対象企業・対象商品・情報源・発行元）が**部分一致**、
JSON列の`keywords`・`tags`が**要素の完全一致**（`array_contains` = `JSON_CONTAINS`）になる。
Prismaが出せるJSON列の条件が完全一致までのためで、`ロッカー`では`ロッカー事業`というタグに
当たらない。タグは登録時の語をそのまま入れる前提で使う。

### 「NEW／更新」バッジと統合元の開閉パネル（#43）

カードには、直近の収集ラン（`getLatestCollectionRunId()`）と比べて新規追加・内容更新された
ものだけに「NEW」「更新」バッジを出す。`collectionRunId`（作成時のラン、週判定に使うため不変）が
直近ランと一致すれば「NEW」、`updatedByRunId`（最後に統合・更新したラン）が一致すれば「更新」。
`mergedSources`（統合元URLのJSON配列）を1件以上持つ記事だけ、カード下部に「更新履歴を見る」の
開閉パネルを出し、統合元URL一覧・`updatedAt`（最終更新日時）・`updateReason`（更新理由）を表示する。

## 日次収集とイベント統合（#43）

宅配・ロッカー業界情報の自動収集は`src/lib/collection.ts`の`runDailyCollection()`
（元は週次のみの`runWeeklyCollection()`）が担当し、毎日20:00 JSTの`collection-daily.yml`が
`POST /api/collection/daily`を叩く。`targetFrom`は「今週（JST日曜0時始まり）の開始」に固定する
——ローリング7日窓のままだと日次実行のたびに週境界をまたぐランが発生し、日次差分を週内へ集約する
前提が崩れるため。

AIDE経由の週報登録（`importWeeklyReport()`）と自動収集（`runDailyCollection()`）は、どちらも
記事1件の取り込みを`upsertIndustryInformationEvent()`に委ねる。

1. 完全URL一致は従来どおり冪等（`duplicate`、何も更新しない）
2. 同じ週・同じ事業のレコードと比較し、発表主体（対象企業→発行元→情報源の優先順）が一致し、かつ
   「対象製品/サービスが一致」または「タイトルが緩く類似し、発表日が近い（5日以内）か情報区分が
   一致」する場合は同一イベントとみなして新規行を作らず統合・上書き更新する（`findEventMatch()`）。
   統合元URL・変更内容から生成した`updateReason`・`updatedByRunId`を記録する
3. マッチしなければ新規イベントとして扱い、**事業ごと週5件（合計10件）**の上限を適用する。上限に
   達している場合、重要度→一次情報かどうか→公開日時の順で新規候補が既存の最弱記事より優先度が
   高ければ最弱記事を削除して置換、そうでなければ新規候補を除外する。置換/除外は必ず
   `CollectionRun.excludedArticles`（JSON配列）・`excludedCount`に記録してから実行する

イベント判定はヒューリスティック（LLMを使わない単語一致・日付近さ）のため、発表主体名の
表記揺れ等で誤統合・未統合が起こり得る。より高精度な判定が要るときは別Issueで検討する。

## CI撮影の認証バイパス

`24.screenshot-required`向け。`/api/dev/login`にアクセスするとCookieが発行され、`src/proxy.ts`と
`src/lib/auth.ts`の両方がそのCookieを検証する（片方だけだとデータが引けず画面が空になるため対で
実装している）。ダミーデータは `pnpm db:seed:ci`（`prisma/seed-ci.mjs`）で投入する。
