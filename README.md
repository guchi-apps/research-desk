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

### 週次収集

毎週日曜日18:00（Asia/Tokyo）に、`.github/workflows/collection-weekly.yml` のcronが次を実行する
（#33）。手動で流したいときはGitHubのActions画面から `Weekly Collection` を
`Run workflow` する。

```bash
curl -X POST https://research-desk.gucchii.com/api/collection/weekly \
  -H "Authorization: Bearer $COLLECTION_CRON_SECRET"
```

`COLLECTION_CRON_SECRET` は本番の `.env`（`deploy.yml` が配る）とGitHubのrepository secret
（cronが送る）の両方に同じ値が要る。片方だけ変えると401になる。値の発行・同期は
`scripts/provision-secret.sh --repo guchi-apps/research-desk --key COLLECTION_CRON_SECRET --generate hex32`
（issue-deck側のスクリプト）で行う。

7日以内の候補を優先して宅配・ロッカー各3件まで、全体6件まで登録する。候補が少ない場合は30日以内
から補足し、同じURLを再実行しても登録しない。レスポンスの `runId` と件数を運用ログへ残す。
取得元の規約・robots.txtに従い、必要以上の本文転載は行わない。フィード障害時はHTTPレスポンスの
`status` が `PARTIAL` または `FAILED` になり、既存データは変更されない。

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
3件まで。同じURLを再送しても `normalizedUrl` の一意制約で重複として集計されるため、毎週日曜日
18:00（Asia/Tokyo）の定期タスクから安全に再実行できる。レスポンスは実行ID（`runId`）・ステータス・
新規／重複件数・事業別件数を返す。

```bash
curl -X POST http://127.0.0.1:3115/api/internal/weekly-report \
  -H "Authorization: Bearer $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"executedAt":"2026-08-30T18:00:00+09:00","targetFrom":"2026-08-24T00:00:00+09:00","targetTo":"2026-08-30T23:59:59+09:00","articles":[{"business":"DELIVERY","informationType":"NEW_PRODUCT","title":"...","url":"https://example.com/a","sourceName":"..."}]}'
```
