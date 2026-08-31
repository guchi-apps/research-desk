import type { CollectionResult } from "@/lib/collection";

/**
 * 収集で新しく入った候補の件数を aide-bot の `POST /api/notices` へ積む（#41）。
 *
 * 契約は guchi-apps/aide の `src/core/connectors/aide-bot/index.ts` の `readAideBotConfig()` に
 * 揃える（`AIDE_BOT_URL`・`AIDE_BOT_TOKEN`・`AIDE_BOT_EMAIL`）。research-deskはaide-botと同一VPS上
 * にあるため`AIDE_BOT_URL`はlocalhost（`http://127.0.0.1:3103`）を想定し、外部公開は不要。
 *
 * **積めなくても収集は成功のまま返す。** ここで投げた例外は呼び出し側へ伝播させない
 * （aide-botの`src/lib/briefing.ts`が`ingestNotice()`を独立したtry/catchに入れているのと同じ）。
 */

interface AideBotConfig {
  url: string;
  token: string;
  email: string;
}

const REQUEST_TIMEOUT_MS = 10_000;
// 次の収集（日次）が来るまでではなく「次の週の候補が出揃うまで」を基準に、1週間で切る。
// 切らないと先週分の新着が翌週の吹き出しに残り続ける。
const EXPIRES_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function readAideBotConfig(): AideBotConfig | null {
  const url = (process.env.AIDE_BOT_URL ?? "").trim().replace(/\/$/, "");
  const token = (process.env.AIDE_BOT_TOKEN ?? "").trim();
  const email = (process.env.AIDE_BOT_EMAIL ?? "").trim();
  if (!url || !token || !email) return null;
  return { url, token, email };
}

/**
 * 収集対象週（`CollectionResult.targetFrom`＝JST日曜0時始まりのISO日時）をdedupeKeyにする。
 * runIdにすると同じ週の手動再実行のたびに別の吹き出しが積まれてしまうため、週単位で上書きさせる。
 */
function weekDedupeKey(targetFrom: string): string {
  return `research-desk-weekly-collection-${targetFrom.slice(0, 10)}`;
}

/**
 * 収集結果を通知する。`insertedCount`が1件以上のときだけ送る（重複・統合更新だけの回や、
 * フィード取得に失敗しただけの回では送らない）。
 */
export async function notifyNewCandidates(
  result: Pick<CollectionResult, "insertedCount" | "targetFrom">,
  listUrl: string,
): Promise<void> {
  if (result.insertedCount < 1) return;

  const config = readAideBotConfig();
  if (!config) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/api/notices`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: config.email,
        source: "research-desk",
        kind: "weekly-collection",
        dedupeKey: weekDedupeKey(result.targetFrom),
        title: "業界情報の新着候補",
        body: `宅配・ロッカー業界の新着候補が${result.insertedCount}件届きました。`,
        url: listUrl,
        priority: "NORMAL",
        expiresAt: new Date(Date.now() + EXPIRES_AFTER_MS).toISOString(),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`aide-botへの通知に失敗しました（HTTP ${response.status}）`);
    }
  } catch (error) {
    console.error("aide-botへの通知に失敗しました", error);
  } finally {
    clearTimeout(timeout);
  }
}
