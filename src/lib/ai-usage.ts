/**
 * AI使用量API（`GET /api/internal/ai-usage`、#243）の集計ロジック。
 *
 * Prismaをimportしない純粋関数にしてあり、`node --test`で直接テストできる。
 * Codex CLI（ChatGPT認証）はトークン数を持たないため、数えるのは呼出回数だけ。
 */

const HOUR_MS = 60 * 60 * 1000;
export const LAST_24H_MS = 24 * HOUR_MS;
export const LAST_7D_MS = 7 * 24 * HOUR_MS;

/** `model`が未記録（`CODEX_MODEL`未設定でCodex既定のモデルを使った場合）の行に付ける固定ID。 */
export const UNKNOWN_MODEL = "codex";

export type UsageRecord = { model: string | null; at: Date };

export type UsageFeature = {
  label: string;
  model: string;
  last24h: { calls: number };
  last7d: { calls: number };
};

export function normalizeModel(model: string | null): string {
  const trimmed = model?.trim();
  return trimmed ? trimmed : UNKNOWN_MODEL;
}

/** 1機能ぶんの完了記録を、モデル別の呼出回数へ集計する。直近7日に1件も無いモデルは出さない。 */
export function summarizeFeature(label: string, records: UsageRecord[], now: Date): UsageFeature[] {
  const since24h = now.getTime() - LAST_24H_MS;
  const since7d = now.getTime() - LAST_7D_MS;
  const byModel = new Map<string, UsageFeature>();

  for (const record of records) {
    const at = record.at.getTime();
    if (at < since7d || at > now.getTime()) continue;
    const model = normalizeModel(record.model);
    let row = byModel.get(model);
    if (!row) {
      row = { label, model, last24h: { calls: 0 }, last7d: { calls: 0 } };
      byModel.set(model, row);
    }
    row.last7d.calls++;
    if (at >= since24h) row.last24h.calls++;
  }

  return [...byModel.values()].sort((a, b) => a.model.localeCompare(b.model));
}
