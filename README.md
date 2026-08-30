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

毎週日曜日18:00（Asia/Tokyo）に、外部スケジューラーまたはGitHub Actionsから次を実行する。

```bash
curl -X POST https://research-desk.gucchii.com/api/collection/weekly \
  -H "Authorization: Bearer $COLLECTION_CRON_SECRET"
```

7日以内の候補を優先して宅配・ロッカー各3件まで、全体6件まで登録する。候補が少ない場合は30日以内
から補足し、同じURLを再実行しても登録しない。レスポンスの `runId` と件数を運用ログへ残す。
取得元の規約・robots.txtに従い、必要以上の本文転載は行わない。フィード障害時はHTTPレスポンスの
`status` が `PARTIAL` または `FAILED` になり、既存データは変更されない。
