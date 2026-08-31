# research-desk

決めた条件で自動収集しつつクリップを溜め、AIアプリ（Claude／ChatGPT）に要約させ、資料として書き出す個人用ツール

- 公開URL: https://research-desk.gucchii.com/
- 種別: Next.js + DB（本番ポート `3115`・PM2）
- データベース: `app_research_desk`（共有MariaDB）

このリポジトリは issue-deck の「新規アプリを立ち上げる」が作成し、CI・デプロイ・
マルチエージェント運用の雛形をコミットした状態で始まっています。中身の実装は
「プロジェクトを初期化する」Issueから進めます。

## 開発

```bash
pnpm install
pnpm dev
```

## 運用

- 日常の開発ブランチは `develop`。`main` は本番と一致するリリース用ブランチ
- `main` へのpushで `.github/workflows/deploy.yml` がVPSへ配る
- エージェント運用のルールは [CLAUDE.md](CLAUDE.md)

### 日次収集

毎日20:00（Asia/Tokyo）に、`.github/workflows/collection-daily.yml` のcronが次を実行する
（#33・#43。元は毎週日曜18:00の週次収集だったが、日次差分で週内の件数を維持する仕様に変えた）。
手動で流したいときはGitHubのActions画面から `Daily Collection` を `Run workflow` する。

```bash
curl -X POST https://research-desk.gucchii.com/api/collection/daily \
  -H "Authorization: Bearer $COLLECTION_CRON_SECRET"
```

`COLLECTION_CRON_SECRET` は本番の `.env`（`deploy.yml` が配る）とGitHubのrepository secret
（cronが送る）の両方に同じ値が要る。片方だけ変えると401になる。値の発行・同期は
`scripts/provision-secret.sh --repo guchi-apps/research-desk --key COLLECTION_CRON_SECRET --generate hex32`
（issue-deck側のスクリプト）で行う。

今週（JST日曜0時始まり）の候補を優先して宅配・ロッカー各5件まで、全体10件まで保持する。候補が
少ない場合は30日以内から補足する。URLが異なっていても発表主体・対象製品・発表日等から同一発表と
判定した場合は新規作成せず既存記事を更新し、統合元URL・更新理由を記録する（#43）。同じURLの
再実行は従来どおり登録しない。上限を超えた場合の置換/除外履歴は収集ラン（`CollectionRun`）に
記録する。レスポンスの `runId` と件数を運用ログへ残す。取得元の規約・robots.txtに従い、必要以上の
本文転載は行わない。フィード障害時はHTTPレスポンスの `status` が `PARTIAL` または `FAILED` に
なり、既存データは変更されない。

### AIDE経由の週報登録（サーバー間連携API）

ChatGPTの定期タスクが整理した週報は、ChatGPTからResearch Deskへ直接繋ぐのではなく、既に
ChatGPTと接続・認証済みのAIDEを共通窓口にして登録する（#31・guchi-apps/aide#211）。

```
ChatGPT定期タスク → AIDEのMCPツール → Research Deskの内部API → Research DeskのDB
```

受け口は `POST /api/internal/weekly-report` で、認証は `INTERNAL_API_KEY` のBearerトークン1本。
呼び出し元は同一VPS上のAIDE（`http://127.0.0.1:3115`）だけを想定しており、外部公開は不要。
シークレットはResearch DeskとAIDEのサーバー環境変数（AIDE側は `AIDE_RESEARCH_DESK_TOKEN`）
だけで管理し、ChatGPTへは渡さない。片方だけ値を変えると連携が止まる。

記事は `DELIVERY`（宅配事業）または `LOCKER`（ロッカー事業）に分け、1回あたり全体6件・各事業
3件まで。同じURLは `normalizedUrl` の一意制約で重複として扱う。URLが異なっていても同一発表と
判定した記事は新規作成せず既存記事を更新するため（#43）、定期タスクから安全に再実行できる。
週あたりの保持上限（事業ごと5件）を超えた場合は、優先度の低い既存記事を置換または新規候補を
除外する。レスポンスは実行ID（`runId`）・ステータス・新規／統合更新／重複／除外件数・事業別件数を
返す。

```bash
curl -X POST http://127.0.0.1:3115/api/internal/weekly-report \
  -H "Authorization: Bearer $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"executedAt":"2026-08-30T18:00:00+09:00","targetFrom":"2026-08-24T00:00:00+09:00","targetTo":"2026-08-30T23:59:59+09:00","articles":[{"business":"DELIVERY","informationType":"NEW_PRODUCT","title":"...","url":"https://example.com/a","sourceName":"..."}]}'
```
