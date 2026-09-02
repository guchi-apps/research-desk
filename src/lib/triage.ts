/**
 * 記事の仕分け（採用／不採用、#94）の判定ルール。
 *
 * DB・Prismaに触れない純粋な関数だけを置き、`node --test`で直接読めるようにしてある
 * （`src/lib/analysis-job-rules.ts`と同じ方針）。
 *
 * 仕分けの状態は専用の列を持たず、#79の`weeklyCandidate`（週報候補に残っているか）と
 * `reviewedAt`（人が一度でも判断したか）から導出する。列を増やすと`weeklyCandidate`と二重の正に
 * なり、AIの対象外判定による自動除外（`shouldAutoExcludeFromWeekly()`）との整合を取り直す
 * ことになるため。
 *
 * | 状態 | `reviewedAt` | `weeklyCandidate` | 意味 |
 * |---|---|---|---|
 * | `pending` | null | true | 未判定。業界ニュース画面にも出る |
 * | `ai_rejected` | null | false | AIが対象外と判定した未判定。人の確認待ち |
 * | `adopted` | あり | true | 人が採用した |
 * | `rejected` | あり | false | 人が不採用にした。削除はせず隠すだけ |
 */

export type TriageState = "pending" | "ai_rejected" | "adopted" | "rejected";
export type TriageFields = { weeklyCandidate: boolean; reviewedAt: Date | null };

export const TRIAGE_LABELS: Record<TriageState, string> = {
  pending: "未判定",
  ai_rejected: "AIが対象外と判定",
  adopted: "採用",
  rejected: "不採用",
};

/** チップの見た目。`globals.css`の`.chip.*`に対応する。 */
export const TRIAGE_CLASS: Record<TriageState, string> = {
  pending: "pending",
  ai_rejected: "outscope",
  adopted: "adopted",
  rejected: "rejected",
};

export function getTriageState(fields: TriageFields): TriageState {
  if (fields.reviewedAt === null) return fields.weeklyCandidate ? "pending" : "ai_rejected";
  return fields.weeklyCandidate ? "adopted" : "rejected";
}

/** 新着記事画面のタブ（`?triage=`）。`pending`は`ai_rejected`も含む「人がまだ判断していない記事」。 */
export type TriageParam = "pending" | "adopted" | "rejected" | "all";
export const TRIAGE_PARAMS: readonly TriageParam[] = ["pending", "adopted", "rejected", "all"];

export function parseTriageParam(value: string | string[] | undefined): TriageParam {
  return typeof value === "string" && (TRIAGE_PARAMS as readonly string[]).includes(value) ? (value as TriageParam) : "pending";
}

// --- まとめて仕分けるAPIの入力 ------------------------------------------------------------

/** 1回のリクエストで受け付ける記事IDの上限。新着一覧の表示上限より少し多めにしてある。 */
export const MAX_TRIAGE_IDS = 100;

export type TriageDecision = "adopt" | "reject";
export type TriageRequest = { articleIds: string[]; decision: TriageDecision };

/** `POST /api/articles/triage`の本文を検証する。重複IDは1つにまとめ、空・上限超過・不正な値はnull。 */
export function parseTriageRequest(body: unknown): TriageRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;
  if (input.decision !== "adopt" && input.decision !== "reject") return null;
  if (!Array.isArray(input.articleIds)) return null;
  const articleIds = [...new Set(input.articleIds.filter((id): id is string => typeof id === "string" && id.trim() !== ""))];
  if (articleIds.length === 0 || articleIds.length > MAX_TRIAGE_IDS) return null;
  return { articleIds, decision: input.decision };
}

// --- 週あたり上限との関係（`src/lib/collection.ts`） --------------------------------------

export type ImportanceValue = "HIGH" | "MEDIUM" | "REFERENCE";
export type PriorityFields = { importance: ImportanceValue; isPrimarySource: boolean; publishedAt: Date | null };
export const IMPORTANCE_RANK: Record<ImportanceValue, number> = { HIGH: 3, MEDIUM: 2, REFERENCE: 1 };

/** 週あたり上限の置換/除外で使う優先順位。重要度→一次情報かどうか→公開日時（新しい方）の順。 */
export function isHigherPriority(a: PriorityFields, b: PriorityFields): boolean {
  if (IMPORTANCE_RANK[a.importance] !== IMPORTANCE_RANK[b.importance]) return IMPORTANCE_RANK[a.importance] > IMPORTANCE_RANK[b.importance];
  if (a.isPrimarySource !== b.isPrimarySource) return a.isPrimarySource;
  return (a.publishedAt?.getTime() ?? 0) > (b.publishedAt?.getTime() ?? 0);
}

/** 週あたり上限に数える記事かどうか。不採用（人・AIどちらでも）は数えない——数えると
 * 無関係な記事が枠を埋め続け、上限を広げた意味が無くなるため。 */
export function countsTowardWeeklyCap(fields: TriageFields): boolean {
  return fields.weeklyCandidate;
}

/** 上限到達時に置き換え（削除）てよい記事かどうか。人が採用した記事は消さない。 */
export function isReplaceable(fields: TriageFields): boolean {
  return fields.reviewedAt === null && fields.weeklyCandidate;
}

export type WeeklyCapDecision<T> = { action: "insert" } | { action: "replace"; target: T } | { action: "exclude" };

/**
 * 新規候補を週あたり上限のなかへ入れられるかを決める。
 *
 * 上限に数える記事（`countsTowardWeeklyCap`）が`limit`未満ならそのまま追加。上限に達していれば、
 * 置き換えてよい記事（未判定のもの）のうち最も弱いものと比べ、候補の方が優先度が高ければ置換、
 * そうでなければ除外。置き換えてよい記事が1件も無い（全部人が採用した）場合も除外する。
 */
export function decideWeeklyCap<T extends TriageFields & PriorityFields>(peers: T[], candidate: PriorityFields, limit: number): WeeklyCapDecision<T> {
  const counted = peers.filter(countsTowardWeeklyCap);
  if (counted.length < limit) return { action: "insert" };
  const replaceable = counted.filter(isReplaceable);
  if (replaceable.length === 0) return { action: "exclude" };
  const weakest = replaceable.reduce((min, item) => (isHigherPriority(item, min) ? min : item));
  return isHigherPriority(candidate, weakest) ? { action: "replace", target: weakest } : { action: "exclude" };
}
