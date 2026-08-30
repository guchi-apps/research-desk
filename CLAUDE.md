# research-desk 固有ルール

このリポジトリで作業するClaude Codeエージェント向けのルール。

**このファイルはissue-deckの画面の「新規アプリを立ち上げる」が置いた雛形である**
（`guchi-apps/issue-deck#2247`）。アプリ固有の前提（構成・認証・検証コマンド・
デプロイの注意点）は、初期化を進めながらここへ書き足していく。

ローカル実行ではユーザー個人環境のグローバルルール（`~/.claude/CLAUDE.md`）も読み込まれるが、
**GitHub Actions上での無人実行はリポジトリをチェックアウトしたワークツリーしか参照できない**
ため、それらは読み込まれない。無人実行でも守られる必要があるルールは、このファイルに
明文化しておく必要がある。

## アプリ概要

| 項目 | 値 |
|---|---|
| 公開URL | https://research-desk.gucchii.com/ |
| 種別 | Next.js + DB |
| 本番ポート | `3115` |
| プロセス管理 | PM2 |
| データベース | `app_research_desk`（共有MariaDB） |

決めた条件で自動収集しつつクリップを溜め、AIアプリ（Claude／ChatGPT）に要約させ、資料として書き出す個人用ツール

技術構成・認証フロー・DBスキーマの現状は [docs/architecture.md](docs/architecture.md) を参照。

## 出力言語

エージェントの出力は日本語で書く。対象は成果物（コミットメッセージ・PR・Issueコメント）
だけでなく、**応答本文・作業の要約・TODO・提示する計画・ツール実行時の説明といった画面に
出る文章も含む**。コード・識別子・ファイルパス・コマンド・設定値・ログやエラーメッセージの
引用は原文（英語）のままでよい。

## 検証コマンド

```bash
pnpm lint
pnpm typecheck
pnpm build:ci
```

**`typecheck` は `next typegen && tsc --noEmit` にしておくこと**（guchi-apps/issue-deck#2378）。
Next.js 16の `PageProps` / `LayoutProps` / `RouteContext` は `.next/types` へ生成される
グローバル型で、生成前は `Cannot find name 'LayoutProps'` になる。`next build` は内部で
型生成するため、**ビルドは通るのに `typecheck` だけが落ちる**という分かりにくい形になる。

**依存を足したら `pnpm approve-builds` を実行し、`pnpm-workspace.yaml` の差分をコミットする。**
pnpm 10系は依存のビルドスクリプトを既定で実行せず、警告だけ出して終了コード0で素通りする。

**`package.json` に `"postinstall": "prisma generate"` を持たせ、`prisma` は
`devDependencies` ではなく `dependencies` に置く**（#3）。`typecheck`（`tsc --noEmit`）は
Prisma Clientの生成物を型として読むが、生成しているのは `build:ci`（`prisma generate && next build`）
だけなので、生成前に `typecheck` を回すと
`Module '"@prisma/client"' has no exported member 'PrismaClient'` と、そこから派生した
`implicitly has an 'any' type` で落ちる。`pnpm install` の副作用で生成が残っているかどうかに
結果が左右されるため、**同じコミットでCIが通ったり落ちたりする**という分かりにくい形になる。
`prisma` をdependencies側に置くのは、`deploy.yml` がVPS上で走らせる
`pnpm install --prod --frozen-lockfile` からもCLIを見えるようにするため（devDependenciesのままだと
本番のpostinstallが `prisma: not found` で落ちる）。

**`eslint.config.mjs` は `eslint-config-next` のサブパスエクスポート
（`eslint-config-next/core-web-vitals` / `eslint-config-next/typescript`）を直接importする。**
`@eslint/eslintrc` の `FlatCompat().extends("next/core-web-vitals", ...)` という旧パターンを
使うと、eslint-config-next 16系では `TypeError: Converting circular structure to JSON` という
原因が分かりにくいエラーで落ちる（eslint-config-next 16はflat configをネイティブにexportして
いるため、legacy config resolverを経由する必要が無い）。

**`eslint.config.mjs` に `.shared-context/`・`.shared-prompts/` のignoreを必ず持たせる。**
Flat configは既定でリポジトリ全体を対象にするため、GitHub Actions実行時にチェックアウトされる
これらのディレクトリ（他リポジトリ由来）もlint対象に入り、無関係なコードのエラーでCIが落ちる。
ローカルでは`.shared-context/`が無いことが多く再現しにくい。

**型チェック・Lintが通ることと、実際の動作が正しいことは別。** 振る舞いが変わる変更では
両方を確かめる。

## 依存関係の追加

新しい依存関係（パッケージ・ライブラリ・ツール）を追加する前には、必ずユーザーに確認を取る。

GitHub Actions上の無人実行では、その場で確認を取る相手がいない。追加が必要だと判断した場合は
追加せずに作業を止め、`00.check-user`ラベル（と理由を表す`01.check-blocked`）を付与した
うえで、なぜ必要かをIssueコメントで相談する。

## シークレットの扱い

- APIキー・トークン・パスワード等の実シークレットをコミットしない。コミットしてよいのは、
  値を空にしたサンプル（`.env.example`）と、1Passwordの`op://vault/item/field`形式の
  参照だけを書いた対応表（`.github/secrets-manifest.tsv`）に限る
- **1Passwordは「人が管理する唯一の正」だが、GitHub Actionsの実行時の取得先ではない。**
  1Passwordサービスアカウントには日次レート制限（アカウント全体で1,000リクエスト/日）が
  あり、実行のたびに読むとフリート全体のデプロイが止まる。`ci.yml`・`deploy.yml`は
  GitHubのsecret/variableから取得する。対応表は`.github/secrets-manifest.tsv`、同期は
  `scripts/sync-github-secrets.sh`（値を変更したときだけ実行する）
- `.github/secrets-manifest.tsv`で**`scope`が`repo`の行に`SOURCE`が`-`のものを
  作らない。** 同期スクリプトが`op read -`を実行して必ず失敗し、GitHub側に値が
  作られないままワークフローの参照が空で通る（`guchi-apps/aide-bot#5`）
- **待受ポートは1Passwordでもマニフェストでも管理しない。** `deploy.yml`に平文で持つ
  （`guchi-apps/docs`の`standards/ports.md`）

## 全アプリ共通の共有知識（shared context）

複数アプリで再利用できる知識は共有知識リポジトリ（`guchi-apps/docs`）で管理する。
GitHub Actions実行では`.shared-context/`へcheckoutされ、ローカル実行では`~/apps/_docs`を
参照できる。**`.shared-context/`配下は読み取り専用として扱い、編集・`git add`・
コミットを行わない。**

読む順序は、`CLAUDE.md`（索引）→ 自分の役割の`agent-rules/` → 必要に応じて
`knowledge/` → 設計判断が要るときだけ`standards/` → 手作業の設定手順が要るときだけ
`guides/`。内容が矛盾する場合はこのファイルを優先する。

実装中に得た知見は、このリポジトリの`docs/`か`CLAUDE.md`へ書くのと、同じ内容を
「知見メモ」コメント（`<!-- knowledge-candidate -->`）としてIssueへ投稿するのを**両方**行う。
共有知識へ格上げすべきかどうかは判定しない。

# Issueごとの複数Claude Codeエージェント運用

## ブランチ運用

- `main`は本番環境と一致するリリース用ブランチで、直接コミット・pushしない。`develop`が
  日常の開発ブランチで、本番へ反映する変更は`develop`→`main`のPull RequestをCI通過後に
  マージする
- Issue単位の作業ブランチは`develop`から作成し、**ブランチ名は`issue-<Issue番号>`とする**
  （例: `issue-123`）。進捗の遷移とcloseはこの命名だけを見ているため、違う命名では
  進捗が一切動かない

## Issueの進捗

**進捗はGitHub ProjectsのStatusで管理する。唯一の正はStatusで、進捗ラベルは存在しない。**
Statusを進めるのはissue-deckだけで、各ワークフローは進捗報告API（`POST /api/progress`）へ
報告する。`gh issue edit`で進捗を付け替えることはできない。

`Ready` → `Planning`（`21.plan-required`のときだけ）→ `Implementation` →
`Develop PR` → `Develop` → `Release` → `Done`（mainへマージ完了。この時点でclose）。

`00.check-user`（ユーザーのチェックが必要）はどの段階でも併用でき、**付けるときは理由を
表す`01.check-*`ラベルも1枚あわせて付ける**（そのリポジトリに定義が無ければ付けなくてよい）。
`11.local`が付いている間は無人実行がそのIssueに対して何も行わない。

## 実装エージェントの禁止事項

- `main` / `develop` への直接コミット・push
- 他Issueのブランチ・worktreeの編集
- **担当Issue以外の実装。** 作業中に別件を新規Issueとして起票するのはよいが、そのIssueを
  このセッション・このブランチで実装しない
- 不要なforce push
- 自分が作成したPull Requestの自己マージ

## 自動マージ不可カテゴリ（`00.check-user`付与対象）

認証・認可／DBスキーマ変更・マイグレーション／本番環境の設定／GitHub Actionsやデプロイ設定／
Secretsや環境変数／課金・決済／大規模な依存関係の更新／`develop`→`main`のマージ。

## PR本文テンプレート

`develop`宛のPRには次を記載する。対応Issueは`closes #番号`を使わず`#番号`のみ
（developマージ時点ではissueをcloseしない運用のため）。

- 対応Issue
- 実装内容
- テスト内容
- 確認方法
- 注意点

## ワークフローの構成

`.github/workflows/`のうち`uses:`で`guchi-apps/issue-deck`を参照しているものは
**トリガー定義だけを持つ薄いcaller**で、ジョブ本体はissue-deck側にある。参照は
`@workflows/vN`のタグ固定で、**`uses:`のタグと`prompts-ref`は必ず同じ値にする。**
タグを上げるPull Requestはissue-deckの画面（設定＞フリート運用）から配られる。

- `issue-labels.yml` … 進捗の状態遷移をイベント駆動で報告する
- `claude-issue-dispatch.yml` … Issue起点の無人実行。**このファイルがデフォルトブランチに
  あることがissue-deckの盤面へ載る条件**なので消さない
- `release-develop-to-main.yml` … バージョンbump PRと develop→main のPR作成
- `version-tag-check.yml` … バージョンの上げ忘れをmain宛PRで落とす。**消さないこと**——
  初回の`main`マージが作った`vX.Y.Z`タグと同じバージョンのまま2回目のリリースを出すと、
  `deploy.yml`のタグ作成が落ちて本番デプロイが止まる（guchi-apps/issue-deck#2378）
- `sync-secrets.yml` … 1Passwordから`.github/secrets-manifest.tsv`のとおりに同期する

自動修復系（`claude-ci-fix.yml`・`claude-conflict-resolve.yml`・`claude-pr-repair.yml`・
`claude-review-develop.yml`・`deploy-retry.yml`）はまだ置かれていない。issue-deckの画面
（設定＞フリート運用）から`guchi-apps/research-desk`へ配れる。

**callerに書ける`with:`は、参照しているタグ時点の再利用ワークフローが持つ入力だけ。**
宣言されていない入力を渡すとワークフローの読み込み自体が失敗する。

## リダイレクト先・外部へ渡すURLの組み立て

**`new URL(request.url).origin`でoriginを組み立てない。** Next.js 16の`request.url`は待受アドレス
（`http://localhost:<PORT>`）を返し、ブラウザが送った`Host`ヘッダーを反映しない。Apacheの
リバースプロキシ配下にある本番では`https://localhost:3115`になり、Supabaseへ渡すOAuthの
`redirect_to`が実在しないURLになる（#14）。`src/lib/request-origin.ts`の`getRequestOrigin()`を
使う。クエリ由来の戻り先（`?next=`）は同ファイルの`safeNextPath()`を通す。
ローカルでは`localhost`しか使わないため再現しにくく、**本番でだけログインが失敗する**という
形で出る。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
