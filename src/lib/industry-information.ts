import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;
// 週の区切りは利用者のいるJST（UTC+9）の日曜0時（#43）。サーバーのタイムゾーン設定に結果を
// 左右させないため、Dateのローカルメソッドは使わずオフセットを足してUTCとして扱う。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 週送りで遡れる上限（`?week=`の下限）。0が今週。 */
export const OLDEST_WEEK_OFFSET = -8;

export type BusinessParam = "all" | "delivery" | "locker";
export type SourceParam = "all" | "primary" | "related";
export type ImportanceParam = "all" | "high" | "medium" | "reference";

export type IndustryInformationFilters = {
  weekOffset: number;
  business: BusinessParam;
  source: SourceParam;
  importance: ImportanceParam;
  keyword: string;
};

export type WeekRange = { start: Date; end: Date };

const BUSINESS_BY_PARAM = { delivery: "DELIVERY", locker: "LOCKER" } as const;
const IMPORTANCE_BY_PARAM = { high: "HIGH", medium: "MEDIUM", reference: "REFERENCE" } as const;
// キーワードは文字列列だけ部分一致で引く。`keywords`・`tags`はJSON列で、Prismaが出せるのは
// 要素の完全一致（array_contains = JSON_CONTAINS）までのため、部分一致は文字列列に任せる。
const KEYWORD_TEXT_FIELDS = ["title", "summary", "targetCompany", "targetProduct", "sourceName", "publisher"] as const;

/** `?week=`の値を扱える範囲（`OLDEST_WEEK_OFFSET`〜0）の整数へ丸める。 */
export function parseWeekOffset(value: string | string[] | undefined): number {
  const parsed = Number(typeof value === "string" ? value : 0);
  return Number.isInteger(parsed) && parsed >= OLDEST_WEEK_OFFSET && parsed <= 0 ? parsed : 0;
}

/** 週送りのオフセットから、その週（JSTの日曜0時〜翌週の日曜0時）のUTC範囲を返す。 */
export function getWeekRange(weekOffset: number, now = new Date()): WeekRange {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const daysFromSunday = jstNow.getUTCDay();
  const sundayJst = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() - daysFromSunday + weekOffset * 7);
  const start = new Date(sundayJst - JST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

function jstParts(date: Date) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1, day: jst.getUTCDate(), hour: jst.getUTCHours(), minute: jst.getUTCMinutes() };
}

/** 週見出し（例: `2026年8月24日 — 8月30日`）。 */
export function formatWeekLabel(range: WeekRange): string {
  const from = jstParts(range.start);
  const to = jstParts(new Date(range.end.getTime() - DAY_MS));
  return `${from.year}年${from.month}月${from.day}日 — ${to.month}月${to.day}日`;
}

/** カードの日付（例: `8月28日`）。 */
export function formatDate(date: Date): string {
  const { month, day } = jstParts(date);
  return `${month}月${day}日`;
}

/** ヘッダーの最終更新（例: `8月30日 09:00`）。 */
export function formatDateTime(date: Date): string {
  const { month, day, hour, minute } = jstParts(date);
  return `${month}月${day}日 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// 週の判定は公開日（`publishedAt`）を基準にする。ただし補足（過去30日から拾った記事）は
// 公開日が対象週より前になるため、公開日で絞ると「その週の週報として登録したのに画面に
// 出てこない」になる。補足と公開日が未設定の記事は、登録した収集ラン（`CollectionRun`）の
// 対象期間が重なる週に出す（#37）。これで1回の週報の本体・補足が同じ週へ揃う。
// ランに紐付いていない記事（#37より前に登録したもの）は、従来どおり収集日で拾う。
function runOrCollectedCondition(range: WeekRange): Prisma.IndustryInformationWhereInput[] {
  return [
    // 期間の重なりで判定する。終端は排他（`targetTo`が翌週の日曜0時ちょうどでも翌週には出さない）。
    { collectionRun: { targetFrom: { lt: range.end }, targetTo: { gt: range.start } } },
    { collectionRunId: null, collectedAt: { gte: range.start, lt: range.end } },
  ];
}

/** 指定した週（JST日曜0時〜翌週日曜0時）に属するかどうかの絞り込み条件。`src/lib/collection.ts`の
 * イベント統合・週あたり上限判定も、表示と同じ週の切り方に揃えるためこれを再利用する。 */
export function weekCondition(range: WeekRange): Prisma.IndustryInformationWhereInput {
  const byRunOrCollected = runOrCollectedCondition(range);
  return {
    OR: [
      { periodScope: "IN_SCOPE", publishedAt: { gte: range.start, lt: range.end } },
      { periodScope: "IN_SCOPE", publishedAt: null, OR: byRunOrCollected },
      { periodScope: "PAST_30_DAYS_SUPPLEMENT", OR: byRunOrCollected },
    ],
  };
}

function keywordCondition(keyword: string): Prisma.IndustryInformationWhereInput {
  return {
    OR: [
      ...KEYWORD_TEXT_FIELDS.map((field) => ({ [field]: { contains: keyword } }) as Prisma.IndustryInformationWhereInput),
      { keywords: { array_contains: keyword } },
      { tags: { array_contains: keyword } },
    ],
  };
}

export type IndustryInformationListItem = Prisma.IndustryInformationGetPayload<Record<string, never>>;

/** 業界ニュース画面が表示する1週ぶんの業界情報を、絞り込み条件つきで取得する。 */
export async function listIndustryInformation(filters: IndustryInformationFilters, now = new Date()): Promise<IndustryInformationListItem[]> {
  const conditions: Prisma.IndustryInformationWhereInput[] = [weekCondition(getWeekRange(filters.weekOffset, now))];
  if (filters.business !== "all") conditions.push({ business: BUSINESS_BY_PARAM[filters.business] });
  if (filters.source !== "all") conditions.push({ isPrimarySource: filters.source === "primary" });
  if (filters.importance !== "all") conditions.push({ importance: IMPORTANCE_BY_PARAM[filters.importance] });
  if (filters.keyword) conditions.push(keywordCondition(filters.keyword));

  // MySQL/MariaDBのENUMは定義順で並ぶ（`prisma/migrations/.../migration.sql`）。
  // `periodScope`はIN_SCOPE→補足、`importance`はHIGH→MEDIUM→REFERENCEの順で、
  // そのまま「補足は後ろ・重要度順」になる。
  return prisma.industryInformation.findMany({
    where: { AND: conditions },
    orderBy: [{ periodScope: "asc" }, { importance: "asc" }, { publishedAt: "desc" }, { collectedAt: "desc" }],
  });
}

/** ヘッダーの「最終更新」に出す、登録済み業界情報のうち最も新しい収集日時。 */
export async function getLastCollectedAt(): Promise<Date | null> {
  const result = await prisma.industryInformation.aggregate({ _max: { collectedAt: true } });
  return result._max.collectedAt ?? null;
}

/** 「NEW／更新」バッジ判定用の、直近の収集ランID。`collectionRunId`（作成時のラン）と
 * `updatedByRunId`（最後に更新したラン）をこれと比較し、一致する記事だけにバッジを出す。 */
export async function getLatestCollectionRunId(): Promise<string | null> {
  const run = await prisma.collectionRun.findFirst({ orderBy: { startedAt: "desc" }, select: { id: true } });
  return run?.id ?? null;
}

export type MergedSource = { url: string; normalizedUrl: string; sourceName: string; publisher: string | null; isPrimarySource: boolean; mergedAt: string; collectionRunId: string };

/** `mergedSources`（統合元URLのJSON配列）を表示用の配列にする。壊れた値は無視する。 */
export function toMergedSources(value: Prisma.JsonValue | null): MergedSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MergedSource => typeof item === "object" && item !== null && typeof (item as MergedSource).url === "string" && typeof (item as MergedSource).normalizedUrl === "string");
}

/** トップ画面の新着記事一覧が表示する件数の上限。週1回程度の収集想定で、直近2回ぶんの目安。 */
export const RECENT_LIMIT = 10;

/** 収集日時（JST基準の日付）から見た「今日」「昨日」「それ以前」の区分。 */
export type RecencyLabel = "today" | "yesterday" | "earlier";

/** トップ画面向けに、収集日時（`collectedAt`）が新しい順で業界情報を取得する。 */
export async function listRecentIndustryInformation(): Promise<IndustryInformationListItem[]> {
  return prisma.industryInformation.findMany({ orderBy: { collectedAt: "desc" }, take: RECENT_LIMIT });
}

/** `date`のJST日付が`now`から見て今日・昨日・それ以前のどれかを返す。 */
export function getRecencyLabel(date: Date, now = new Date()): RecencyLabel {
  const target = jstParts(date);
  const today = jstParts(now);
  const targetDay = Date.UTC(target.year, target.month - 1, target.day);
  const todayDay = Date.UTC(today.year, today.month - 1, today.day);
  const diffDays = Math.round((todayDay - targetDay) / DAY_MS);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "earlier";
}

/** JSON列（`keywords`・`tags`）を表示用の文字列配列にする。 */
export function toStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** `extractedMetrics`（項目が増える前提のJSON）を「主な数値・事実」の1行にまとめる。 */
export function formatMetrics(value: Prisma.JsonValue | null): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" ／ ") || null;
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined);
    return entries.length ? entries.map(([key, item]) => `${key}: ${String(item)}`).join(" ／ ") : null;
  }
  return String(value);
}
