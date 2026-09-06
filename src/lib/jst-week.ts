/**
 * JST（UTC+9）基準の週の区切りと日付の整形。
 *
 * Prisma・DBに触れない純粋な関数だけを置く（`node --test`から直接読めるようにするため。
 * `src/lib/triage.ts`・`src/lib/analysis-job-rules.ts`と同じ方針）。
 *
 * 元は`src/lib/industry-information.ts`にあったが、週報メール（#110）の本文組み立てが
 * **Prismaを読めない場所（単体テストとブラウザ側のプレビュー）**から同じ週の切り方・
 * 同じ日付表記を使う必要があるため、ここへ切り出した。`industry-information.ts`は
 * 従来どおり同じ名前で再エクスポートしているので、既存の呼び出し側は変わらない。
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

// 週の区切りは利用者のいるJST（UTC+9）の日曜0時（#43）。サーバーのタイムゾーン設定に結果を
// 左右させないため、Dateのローカルメソッドは使わずオフセットを足してUTCとして扱う。
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 週送りで遡れる上限（`?week=`の下限）。0が今週。 */
export const OLDEST_WEEK_OFFSET = -8;

export type WeekRange = { start: Date; end: Date };

/** `?week=`の値を扱える範囲（`OLDEST_WEEK_OFFSET`〜0）の整数へ丸める。 */
export function parseWeekOffset(value: string | string[] | undefined, fallback = 0): number {
  const parsed = Number(typeof value === "string" ? value : fallback);
  return Number.isInteger(parsed) && parsed >= OLDEST_WEEK_OFFSET && parsed <= 0 ? parsed : fallback;
}

/** 週送りのオフセットから、その週（JSTの日曜0時〜翌週の日曜0時）のUTC範囲を返す。 */
export function getWeekRange(weekOffset: number, now = new Date()): WeekRange {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const daysFromSunday = jstNow.getUTCDay();
  const sundayJst = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() - daysFromSunday + weekOffset * 7);
  const start = new Date(sundayJst - JST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

export function jstParts(date: Date) {
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

/** メール本文のように、月日だけでは足りない場所で使うJSTの年月日（例: `2026-09-03`）。 */
export function formatIsoDate(date: Date): string {
  const { year, month, day } = jstParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** その日時がJSTでこの週の範囲に入るか。終端は排他（翌週の日曜0時ちょうどは含めない）。 */
export function isWithinWeek(date: Date | null, range: WeekRange): boolean {
  return date !== null && date.getTime() >= range.start.getTime() && date.getTime() < range.end.getTime();
}

/** 収集日時（JST基準の日付）から見た「今日」「昨日」「それ以前」の区分。 */
export type RecencyLabel = "today" | "yesterday" | "earlier";

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
