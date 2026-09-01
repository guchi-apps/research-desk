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
全体10件、各事業5件までを入力検証する（#47。当初は全体6件・各事業3件で、AIDE側が広げた上限
（guchi-apps/aide#226）にここも揃えた）。`extractedMetrics`（主要数値のオブジェクト）はAIDE側の
制限（30項目・JSONにして2000文字まで）と同じ上限で受け付ける。事業あたりの入力上限（5件）は
`upsertIndustryInformationEvent()`側の週あたり保持上限（`BUSINESS_WEEKLY_LIMIT`＝5件/事業）と
同じ値のため、1回のリクエストの5件だけで週の保持上限にちょうど到達する（後述の
置換／除外はその次のリクエスト、たとえば翌日分から働く）。記事の取り込みは
`upsertIndustryInformationEvent()`（#43。自動収集の`runDailyCollection()`とも共通）に委ね、
完全URL一致は従来どおり冪等に扱い、URLが異なっていても同一イベントと判定した記事は新規作成せず
既存記事へ統合・上書き更新する。登録結果は`CollectionRun`に保存し、新規・統合更新・重複・除外の
件数と`DELIVERY`／`LOCKER`別の件数を返す（`mergedCount`・`excludedCount`はレスポンスへの追加
フィールドで、AIDE側の契約は後方互換）。レート制限はプロセス内で認証済みクライアントごとに1分20回
までとするため、複数プロセス環境ではリバースプロキシ側の制限も併用する。シークレットと入力本文は
ログへ出さない。

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

**サブPCのworktreeにはDB接続情報が渡されないため、DB書き込みを伴う動作確認はローカルでは
できないことが多い**（#47）。1PasswordのDB共通アイテム（`db-host`＝`localhost`）は本番（VPS）上で
接続する前提の値で、サブPCにはローカルMariaDBもDocker/Podmanも無く、`sudo`権限も無い
セッションが大半のため、その場では用意できない。SSHトンネル（`database.md`）で本番相当のDBへ
繋ぐ手もあるが、テスト用の書き込みで本番データを汚す危険がある。`.env.local`の`DATABASE_URL`を
ダミー値にしても`requireInternalApiKey()`・`validateInput()`（入力検証）までは到達できるため、
**バリデーションの単体的な挙動はcurlで確認できる**が、`upsertIndustryInformationEvent()`側の
週あたり上限・置換／除外・統合更新の実地確認まではできない。それらはコードレビューでの
突き合わせに留める判断もありうる。

**DBに依存しない画面（`/settings`等）は、`/api/dev/login`のバイパスCookie経由でcurlのまま
確認できる**（#67）。`getCurrentUser()`はバイパスCookieがあればSupabaseへ問い合わせずに
即座に認証済みを返すため（`src/lib/auth.ts`の`getDevLoginEmail()`が先に評価される）、
`NEXT_PUBLIC_SUPABASE_URL`が未設定でも到達できる。一方、Prismaを呼ぶ画面（`/`・`/dashboard`）は
`DATABASE_URL`未設定だと`PrismaClientInitializationError`になり、エラーが`loading.tsx`の
Suspense境界内で起きるため、レスポンスは200のまま起動画面（`splash-shell`）で止まって見える
（ステータスコードだけでは気付けない）。

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
境界変更にともなう既存データの再集計・移行は不要（`weekCondition()`は公開日・発生日・収集ランの
期間重なりで判定するロジックのままで、境界がずれるだけのため）。`weekCondition()`は
`src/lib/collection.ts`のイベント統合・週あたり上限判定からも再利用する。

どの週に出すかは公開日（`publishedAt`）で決める。`periodScope`（`IN_SCOPE`／補足の
`PAST_30_DAYS_SUPPLEMENT`）による分岐はない——以前は補足だけ常に登録した収集ランの週に
出していたが、公開日が入っている補足記事が実際の公開週ではなく登録週（例:「30日以内」バッジ
付きで8/3公開の記事が8/30週に表示される）に出てしまい、利用者からは「正しい週に表示されて
いない」と映っていた（#59）。公開日が入っている記事はその公開日どおりの週に出すのが期待どおり
の挙動のため、`periodScope`に関わらず次の優先順位に統一した。

- **公開日が未設定の記事は、発生日（`occurredAt`）が入っていればそちらで判定する（#52）。**
  発生日も未設定の場合のみ、収集ランの対象期間（無ければ収集日）にフォールバックする。
  公開日未設定の記事を機械的に「登録した日」の週へ出すと、記事の内容と表示週がズレるため
  （AIDE経由の週報登録では公開日を付けない記事もあり、これが実際に起きていた）

`src/lib/collection.ts`側のイベント統合判定（`findEventMatch()`・`upsertIndustryInformationEvent()`
の`referenceDate`）は、これとは別の理由で**発生日→公開日**の優先順位を使っている。転載記事は
発行元により公開日がバラつくため、同一イベントかどうかの判定には事象そのものが起きた日を優先する
方が適切という別の関心事によるもの。表示側（`weekCondition()`）は「読者が見る週」を決める基準、
統合側は「同一イベントかどうか」を決める基準であり、意図的に優先順位が異なる（統一はしていない）。

`IndustryInformation.collectionRunId`は`importWeeklyReport()`・`runDailyCollection()`（#43で
`runWeeklyCollection()`から改名）が登録時に埋める（#37）。**公開日・発生日がどちらも未設定の
記事だけ**、収集ランの対象期間（**期間の重なり**——`targetFrom < 週の終わり` かつ
`targetTo > 週の始まり`。`targetTo`が翌週の日曜0時ちょうどでも翌週へはみ出さない）にフォール
バックする。収集ランに紐付いていない記事（#37より前に登録したもの、あるいはランに紐付いていても
公開日・発生日がどちらも未設定の記事）は、従来どおり収集日（`collectedAt`）の週で拾う。

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

## アイコン・PWA起動画面・ログイン画面（#46）

初期化時（issue-deck#2247）が置いた単色プレースホルダのアイコンと、暫定のTailwind slateデザインの
ログイン画面を、実際のブランドトークン（`globals.css`の`--navy`/`--teal`/`--paper`）へ揃えた。

- **アイコンはSVGを直接手書きし、PNG化はホストのシステムツール（`rsvg-convert`）で行った。**
  `pnpm-workspace.yaml`の`allowBuilds`に`sharp`が載っているが、これはNext.jsが画像最適化で
  使う任意の依存で`package.json`には現れず、アイコン生成用に新規導入したものではない。
  新規npm依存を増やさずに済むため、SVG→PNGの変換はNext.jsのビルド作業に含めず、リポジトリには
  生成済みのPNG（`public/icon-192.png`・`public/icon-512.png`・`public/apple-icon.png`）だけを
  コミットしている。デザインを変える場合は`public/icon.svg`を編集し、同じ`rsvg-convert`コマンドで
  再生成する（Apple Touch Iconだけは、iOS側が自前でマスクをかけるため角丸を付けない別ソースから
  生成している）
- **起動画面（スプラッシュ）は`src/app/loading.tsx`（App Routerのファイル規約）で実装した。**
  当初はルート直下のこの1枚だけが唯一の`loading.tsx`で、遷移のたびにサイドバーごと全画面が
  これに置き換わっていたが、#73でルートグループ（`(app)`）ごとの`loading.tsx`へ役割を分けた。
  詳細は「ページ遷移中のスケルトン表示（#73）」を参照。Service Worker等によるオフライン対応は
  `guchi-apps/docs`の`standards/tech-stack.md`のとおり必須ではないため、今回は追加していない
- **ログイン画面は`login-shell`/`login-card`等の専用クラスで、トップ画面・業界ニュース画面と
  同じトークンに揃えた。** 元は`bg-slate-950`等のTailwind暫定スタイルで、`src/app/layout.tsx`の
  `body`にも同じくTailwindの`bg-slate-950 text-slate-100`が付いていたため、`globals.css`の
  `body{background:#eef4f1}`（クラスセレクタがタグセレクタより詳細度で勝つ）が上書きされ、
  ブランドの配色ではなく暗い既定色が効いていた。`body`からTailwindの色クラスを外し、
  `globals.css`側の基本配色に一本化した

## CI撮影の認証バイパス

`24.screenshot-required`向け。`/api/dev/login`にアクセスするとCookieが発行され、`src/proxy.ts`と
`src/lib/auth.ts`の両方がそのCookieを検証する（片方だけだとデータが引けず画面が空になるため対で
実装している）。ダミーデータは `pnpm db:seed:ci`（`prisma/seed-ci.mjs`）で投入する。

## 設定画面（`/settings`, #67）

スマホ幅（767px以下）ではヘッダー右上のログアウトボタンが元々`.user button{display:none}`で
隠れており、アバターも`font-size:0`で非活性表示のままだった（モバイルからログアウトする手段が
実質無かった）。この画面を新設し、アカウント情報（メールアドレス）・ログアウト・更新履歴
（`src/lib/changelog.ts`の`APP_CHANGELOG`。バージョンbump時に自動更新される配列で、それまで
どの画面からも参照されていなかった）をまとめた。

トップ画面・業界ニュース画面・画像を送る画面の3箇所で重複していたヘッダー右上（アバター＋
ログアウト）は`src/components/HeaderUserMenu.tsx`に共通化し、あわせて設定画面への⚙ボタンを
追加した。⚙ボタンは`globals.css`側で`display:none`が既定で、`@media(max-width:767px)`の
中でだけ`display:grid`に切り替える（PC・iPadでは従来どおりアバター＋ログアウトのまま）。

## 画像を社用メールに送る（#64）

`/dashboard/image-mail`は、撮影・選択した写真をブラウザ内でJPEG圧縮・ZIP化し、
`POST /api/image-mail/send`経由でAIDEへ転送する画面。**このIssueはResearch DeskとAIDEの
2リポジトリにまたがるが、実装エージェントは担当リポジトリ以外を編集できないため、AIDE側
（Gmail送信・件名/宛先固定・idempotency処理・履歴記録）は`guchi-apps/aide`へ別Issueとして
切り出した。** Research Desk側は「AIDEへ送信リクエストを送るところまで」が実装範囲で、
AIDE側がマージされるまでエンドツーエンドの送信は動かない。

- **画像圧縮・ZIP化はいずれも追加依存を最小限にしている。** リサイズ・JPEG化は
  `createImageBitmap()` + `<canvas>.toBlob()`というブラウザ標準APIのみで完結し、追加依存は
  ZIP化の`fflate`1つだけ（`src/lib/image-mail-client.ts`）。横幅の自動段階縮小（1200→900→600px）は、
  ZIP作成後のサイズを見てから次の横幅で作り直す素朴なループで、事前見積もりはしない
- **送信APIは`/api/internal/*`と違う認証にしている。** `/api/internal/weekly-report`はAIDE→
  Research Desk方向（共有シークレット）だが、`/api/image-mail/send`はブラウザ→Research Desk
  サーバー方向のため`getCurrentUser()`によるSupabaseセッション認証を使う。Research Desk→AIDE
  方向の送信先設定は`AIDE_IMAGE_MAIL_URL`/`AIDE_IMAGE_MAIL_TOKEN`で、`src/lib/aide-bot-notice.ts`
  （aide-bot＝通知窓口、`AIDE_BOT_*`）とは別のAIDE本体向けの環境変数。名前が紛らわしいので、
  「aide-bot」と「AIDE本体（Gmail送信等を持つ側）」を混同しないこと
- 画像・ZIPはRoute Handler側でもメモリ上のFormDataのまま中継するだけで、ディスク・DBへは
  一切書き込んでいない（受け入れ条件「画像は送信後も保存されない」に対応）

## PWAアップデート通知（#68）

PWAとしてホーム画面から起動されたままだと、ブラウザを再訪しない限り新しいデプロイに
気づけない。`src/components/AppUpdateChecker.tsx`が`/api/app-version`（`package.json`の
`version`を`force-dynamic`＋`no-store`で返すだけのRoute Handler）を10分間隔と
`visibilitychange`復帰時にポーリングし、現在のバージョンと異なれば画面下部にバナーを表示する。

**Service Workerは使わない。** issue-deckも同名の`AppUpdateChecker`コンポーネントを持つが、
アップデート検知にService Workerは使っておらず（`public/sw.js`はPush通知の受信専用）、
同じバージョンポーリング方式を踏襲した。オフライン対応（Service Workerによるキャッシュ）は
`guchi-apps/docs`の`standards/tech-stack.md`のとおり必須ではないため、今回もあわせて導入は
していない。

**issue-deck側と違い、バックグラウンド復帰時に自動リロードはしない。** issue-deckの元実装は
「復帰直後は未保存入力を失う心配がない安全なタイミング」として自動リロードするが、
`/dashboard/image-mail`（#64）は画像選択・件名入力という未保存状態を持つ画面のため、
気づかないうちにリロードされると入力が消える。更新は必ずバナーの「更新する」ボタン経由の
ユーザー操作でのみ行う。今後、フォーム状態を持つ画面を追加する場合も、この前提（自動リロード
なし）を崩さないよう注意する。

## ページ遷移中のスケルトン表示（#73）

`/`・`/dashboard`・`/dashboard/image-mail`・`/settings`の4画面は、当初は各`page.tsx`が
サイドバー込みの`app-shell`全体をそれぞれ描画していた（共通レイアウトが無かった）。そのため
Next.jsのSuspense境界（`src/app/loading.tsx`）がサイドバーごと丸ごと全画面のネイビースプラッシュ
（`SplashScreen`）に置き換えており、遷移のたびに画面全体が一瞬別物に切り替わって見えていた。

- **サイドバーを`src/app/(app)/layout.tsx`（ルートグループ）へ切り出した。** 同期的
  （`await`を含まない）コンポーネントなので遷移時にSuspenseへ引っかからず、配下の`page.tsx`が
  持つ非同期処理（DB取得等）の間もサイドバーは再マウントされない。4画面は`(app)`配下へ移動した
  だけでURLは変わらない（Next.jsのルートグループはURLパスに現れない）
- **各ルートに専用の`loading.tsx`を置き、コンテンツ部分だけをそのページの形に合わせた
  スケルトン（`src/components/skeletons.tsx`）に差し替えた。** Next.jsは最も近い`loading.tsx`を
  使うため、`(app)/dashboard/loading.tsx`のようにネストした`loading.tsx`があれば、より外側の
  `(app)/loading.tsx`はそのサブツリーには使われない
- **`loading.tsx`はクライアント側の`<Link>`遷移だけでなく、`<form method="get">`送信や
  素の`<a>`によるハードナビゲーションでも効く。** Next.jsのストリーミングSSRは、フルページ
  ナビゲーションでも非同期なページ本体の代わりに`loading.tsx`をまず送出し、データが揃い次第
  差し替える。業界ニュース画面のフィルター送信・週送りリンクは元々素の`<a>`/`<form>`だが
  （#73では変更していない）、この仕組みにより移行後もスケルトンが機能する
- **CSSコメント中に`*/`を構成する文字列（例: `(app)/**/loading.tsx`のような二重引用）を
  書かない。** Turbopackのビルド用CSS最適化がコメントを字句レベルで終端してしまい、
  以降のコメント本文がCSSとして解釈されてビルド警告（`Unexpected token`）になる
  （`pnpm build:ci`で顕在化、`pnpm dev`では気づきにくい）

## 記事のAI解析（ChatGPT / Codex CLI、#79）

収集・登録した記事を、**サブPC上のCodex CLI**（`codex login`でChatGPTアカウント認証）に解析させる。
Research DeskのサーバーからOpenAI APIは呼ばない（従量課金ではなくChatGPTの契約枠を使うため）。
実行は定期バッチではなく、画面の「AI解析」「再解析」から積むオンデマンド方式。

### なぜ専用のジョブキューを新設したか

サブPCには汎用のジョブキューが無い。常駐しているのはissue-deckの
`issue-deck-dispatch-poller.service`だけで、その`DispatchJob`は`repositoryFullName`・`issueNumber`が
NOT NULLの必須列（`activeKey`も`owner/repo#番号`の形）のため、**外部アプリが任意のペイロードの
ジョブを積む口が無い**。仕組み（systemd user unit + ポーラー + Bearer共有シークレット +
claim/reportの2エンドポイント）だけを踏襲し、スキーマは新設した。

### ジョブの流れ

| 経路 | パス | 認証 |
|---|---|---|
| 画面 → サーバー | `POST /api/analysis/jobs` | Supabaseセッション（`getCurrentUser()`） |
| 画面 → サーバー | `POST /api/analysis/review` | 同上 |
| サブPC → サーバー | `POST /api/internal/analysis/claim` | `ANALYSIS_WORKER_SECRET` |
| サブPC → サーバー | `POST /api/internal/analysis/report` | 同上 |

**`ANALYSIS_WORKER_SECRET`はAIDE用の`INTERNAL_API_KEY`と別の値にしている。** AIDEは同一VPS内
（`127.0.0.1`）からの呼び出しだが、ポーラーはサブPCからインターネット越しに来る別の主体で、
片方を失効させてももう片方が止まらないようにするため。どちらも未設定なら素通りではなく503
（`src/lib/internal-auth.ts`）。

状態は`queued` / `running` / `completed` / `failed` / `auth_required`の5つ
（`ArticleAnalysisJob.status`）。

- **二重実行はDBで防ぐ。** `ArticleAnalysisJob.activeKey`は`QUEUED`・`RUNNING`の間だけ`articleId`が
  入るUNIQUE列で、終了時に`null`へ戻す（MySQLのUNIQUEはNULLの重複を許す）。アプリ側で「実行中の
  ジョブがあるか」を先に読んでから作る方式だと、PM2の複数プロセスから同時に押されたとき両方が
  「無い」と読んで2本積む
- **落ちたポーラーはリースで回収する。** `claim`時に`leaseExpiresAt`（15分）を入れ、期限切れの
  `RUNNING`は次の`claim`で`QUEUED`へ戻す。戻ったジョブへ遅れて届いた結果は`canAcceptReport()`が
  捨てる（次の実行の結果が正）
- **結果は履歴として積む。** `ArticleAnalysis`は1ジョブ1行で、記事本体（`IndustryInformation`）の
  要約・示唆は上書きしない。画面が使うのはAIの生成内容（`ArticleAnalysis`）と、人が確定した内容
  （記事側の`business`・`importance`・`weeklyCandidate`＋`reviewedAt`）の両方で、区別して表示する
- **対象外（`OUT_OF_SCOPE`）と判定された記事は週報候補から自動で外す**（`weeklyCandidate=false`）。
  ただし人が一度でも確定している記事（`reviewedAt`が入っている）はその判断を優先し、AIの判定で
  書き換えない（`shouldAutoExcludeFromWeekly()`）
- `IndustryInformation.analysisStatus`・`analyzedAt`は最新ジョブの状態を写した**非正規化列**。
  画面の絞り込みをPrismaの`where`で行うために置いてあるので、ジョブの状態を変える処理は
  `src/lib/article-analysis.ts`の同一トランザクション内でここも更新すること

### プロンプトと出力スキーマはサーバーが持つ

`claim`の応答に**プロンプト本文とJSON Schemaを載せて**ポーラーへ渡す（`src/lib/analysis-prompt.ts`）。
ポーラーは受け取った文面を`codex exec`へ流すだけの実行役なので、**解析の観点を変えてもサブPCへ
スクリプトを配り直す必要がない。** 構造化出力の制約に合わせ、スキーマは全プロパティを`required`・
`additionalProperties: false`にし、省略可能な項目は`["string","null"]`で表す。

ポーラーが叩くコマンドは次の形（`scripts/codex-analysis-worker.mjs`）。

```bash
codex exec --sandbox read-only --skip-git-repo-check --ephemeral --color never \
  -c tools.web_search=true --output-schema <schema.json> -o <result.json> -C <tmpdir> -
```

- **`codex exec`は`--search`を受け付けない**（`codex --help`には出るが`codex exec --help`には無い）。
  関連情報の追加調査でWeb検索を使うには`-c tools.web_search=true`で設定を上書きする
- **`--output-schema` + `-o <FILE>`で受け取る。** 標準出力をパースすると進捗表示が混ざったときに
  壊れるため、最終応答だけをファイルへ書かせて読む
- **プロンプトは引数ではなく標準入力から渡す**（`-`）。記事本文がプロセス一覧（`ps`）に出ないため

### 認証方式の検知

Codexの認証方式は`~/.codex/auth.json`の`auth_mode`で判定する（`codex login status`の文言に依存しない）。
ChatGPTアカウント認証なら`auth_mode`が`chatgpt`・`OPENAI_API_KEY`が`null`。

- ポーラーは子プロセスの環境から**`OPENAI_API_KEY`を必ず削除**してから`codex`を起動する
- 報告された`codexAuthMode`が`chatgpt`以外なら、実行が成功しうる状態でも`auth_required`として
  止める（`classifyFailure()`）。APIキー認証へ切り替わったまま従量課金で回り続けるのを防ぐため
- 画面上部の実行環境ストリップ（`AnalysisStatusStrip`）に認証方式・最終応答・キュー件数を出す

失敗の分類（ログイン切れ／利用枠到達／出力不正／実行失敗／時間切れ）は**サーバー側の
`src/lib/analysis-job-rules.ts`**が行い、ポーラーは終了コードと標準エラーの末尾だけを送る。
判定条件をサーバーへ寄せてあるため、単体テスト（`pnpm test`）で確かめられる。

### サブPC側の設置

ポーラー本体はこのリポジトリの`scripts/codex-analysis-worker.mjs`（追加依存なし・Nodeのみ）で、
常駐用のsystemd user unitと設定例も同梱している。

| ファイル | 置き場所 |
|---|---|
| `scripts/codex-analysis-worker.mjs` | サブPCのチェックアウト（`~/apps/research-desk`）からそのまま実行 |
| `deploy/research-desk-analysis-poller.service` | `~/.config/systemd/user/` へコピー |
| `deploy/analysis-worker.env.example` | `~/.config/research-desk/analysis-worker.env`（chmod 600）の記入例 |

**サブPCの`~/.config/systemd/user/`は`guchi-apps/subpc`の管理対象外**（issue-deckの
`src/lib/infra-config-repos.ts`に受け口が無く、issue-deck自身のpollerのunitも同じ扱い）。
そのためunitはこのリポジトリで持ち、設置だけを手作業Issueで行う。**このリポジトリのPRを
マージしただけでは解析は動き始めない**（画面上は「未解析」のまま止まり、既存機能には影響しない）。

運用時の確認手順。

```bash
codex login status                     # `Logged in using ChatGPT` ならChatGPTアカウント認証
jq -r .auth_mode ~/.codex/auth.json    # `chatgpt` であること（機械判定はこちらを使う）
systemctl --user status research-desk-analysis-poller
```

### DBに繋がない単体テスト（`pnpm test`）

`node --test 'src/**/*.test.ts'`。Node 24が型を剥がしてTypeScriptのまま実行するため、テスト用の
依存もビルド手順も要らない（`tsconfig.json`の`allowImportingTsExtensions`は、テストが`./x.ts`と
拡張子つきでimportするため）。**テストから読めるのはPrismaに触れないモジュールだけ**なので、
ジョブの判定ルールは`src/lib/analysis-job-rules.ts`へ、プロンプトと結果検証は
`src/lib/analysis-prompt.ts`へ分けてある。DBを伴う挙動（実際の重複投入・リース回収）は
本番相当のDBが無いローカルでは確かめられないため、コードレビューでの突き合わせに留めている。
