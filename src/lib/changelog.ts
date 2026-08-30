export type ChangelogEntry = {
  version: string;
  /** ISO 8601 (YYYY-MM-DD) */
  date: string;
  /** 何が変わったか。1項目1行 */
  changes: string[];
  /** どう使うか（どこを開く / 何を押す / どうなれば成功か）。無い版もある */
  usage?: string[];
};

/**
 * 利用者向けの更新履歴。
 *
 * **手で書き足す必要は無い。** develop→mainのリリースフロー
 * （`.github/workflows/release-develop-to-main.yml`）が差分から利用者向けの文面を生成し、
 * バージョンbump時の `version` lifecycleスクリプト（`scripts/version-changelog.mjs`）が
 * この配列の先頭へ新しいエントリを挿入する。生成された文面はバンプPRの本文にも載るため、
 * 内容の確認はそこで行う。**package.json の scripts に
 * `"version": "node scripts/version-changelog.mjs"` を足すこと**（無いと追記されない）。
 *
 * ## 記載ルール（手で直すときに守ること）
 *
 * - 利用者が画面を見て体感できる変更だけを書く
 * - 内部実装・リファクタリング・CI/CD・依存関係の更新は書かない
 * - 開発者向けの用語は利用者向けの言い方に言い換える
 * - 過去バージョンのエントリは変更しない
 *
 * 新しい順に並べる。
 */
export const APP_CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.1",
    date: "2026-08-30",
    changes: [
      "本番環境でGoogleアカウントによるログインが正しく完了しない不具合を修正しました。ログイン後に正しいページへ戻れるようになりました。",
    ],
    usage: [
      "1. https://research-desk.gucchii.com/ を開き、ログイン画面を表示する",
      "2. 「Googleでログイン」を押す",
      "3. Googleアカウントでの認証を完了する",
      "4. ダッシュボード画面が表示されればログイン成功",
    ],
  },];
