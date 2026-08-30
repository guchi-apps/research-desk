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
