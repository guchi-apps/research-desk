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

// 週の区切りは利用者のいるJST（UTC+9）の月曜0時（#125）。#43でいったん日曜0時にしたが、
// カレンダーピッカー（月曜始まり表示）と同じ境界に揃えるため月曜へ戻した。どの日付項目を
// 優先して週を判定するか（公開日→発生日→収集期間）という#43の判断基準はこれと無関係で
// 変えていない。サーバーのタイムゾーン設定に結果を左右させないため、Dateのローカルメソッドは
// 使わずオフセットを足してUTCとして扱う。
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 週送りで遡れる上限（`?week=`の下限）。0が今週。 */
export const OLDEST_WEEK_OFFSET = -8;

export type WeekRange = { start: Date; end: Date };

/** `?week=`の値を扱える範囲（`OLDEST_WEEK_OFFSET`〜0）の整数へ丸める。 */
export function parseWeekOffset(value: string | string[] | undefined, fallback = 0): number {
  const parsed = Number(typeof value === "string" ? value : fallback);
  return Number.isInteger(parsed) && parsed >= OLDEST_WEEK_OFFSET && parsed <= 0 ? parsed : fallback;
}

/** 週送りのオフセットから、その週（JSTの月曜0時〜翌週の月曜0時）のUTC範囲を返す。 */
export function getWeekRange(weekOffset: number, now = new Date()): WeekRange {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const daysFromMonday = (jstNow.getUTCDay() + 6) % 7;
  const mondayJst = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() - daysFromMonday + weekOffset * 7);
  const start = new Date(mondayJst - JST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** ISO 8601の週番号（その週のThursdayが属する年で数える）。カレンダーピッカーの目印表示に
 * のみ使い、業界情報の週判定（`weekCondition()`等）には使わない。 */
export function getIsoWeekNumber(date: Date): number {
  const { year, month, day } = jstParts(date);
  const dateOnlyMs = Date.UTC(year, month - 1, day);
  const isoWeekday = (new Date(dateOnlyMs).getUTCDay() + 6) % 7; // 月=0〜日=6
  const thursdayMs = dateOnlyMs + (3 - isoWeekday) * DAY_MS;
  const thursdayYear = new Date(thursdayMs).getUTCFullYear();
  const yearStartMs = Date.UTC(thursdayYear, 0, 1);
  return Math.floor((thursdayMs - yearStartMs) / DAY_MS / 7) + 1;
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

/** その日時がJSTでこの週の範囲に入るか。終端は排他（翌週の月曜0時ちょうどは含めない）。 */
export function isWithinWeek(date: Date | null, range: WeekRange): boolean {
  return date !== null && date.getTime() >= range.start.getTime() && date.getTime() < range.end.getTime();
}

// --- 週選択カレンダーピッカー（#125） ----------------------------------------------------

/** カレンダーの1マス。`weekOffset`は所属する週送りのオフセット（選べる範囲の外は`null`）。 */
export type CalendarDay = { iso: string; day: number; weekOffset: number | null; isToday: boolean };
/** カレンダーの1行＝1週間（月曜始まり）。 */
export type CalendarWeekRow = { weekNumber: number; days: CalendarDay[] };
export type CalendarMonth = { label: string; weeks: CalendarWeekRow[] };

/** カレンダーピッカー用に、選べる週（`oldestOffset`〜0）を月曜始まりの行へ月ごとにまとめる。
 * 週の区切りが月曜0時始まりに揃っているため、選べる範囲は常に週の境界ちょうどで切れており、
 * 月をまたぐ週（例: 8/31〜9/6）も1行の中で自然に表現できる。選べる範囲より後ろ（今週より先）は、
 * 直近月をカレンダーとして見やすくするため、月の終わりまで`weekOffset: null`の行で埋める。 */
export function buildWeekCalendarMonths(now = new Date(), oldestOffset = OLDEST_WEEK_OFFSET): CalendarMonth[] {
  const todayIso = formatIsoDate(now);
  const months: CalendarMonth[] = [];

  function monthFor(start: Date): CalendarMonth {
    const { year, month } = jstParts(start);
    const label = `${year}年${month}月`;
    const existing = months.find((entry) => entry.label === label);
    if (existing) return existing;
    const created = { label, weeks: [] };
    months.push(created);
    return created;
  }

  function buildDays(start: Date, weekOffset: number | null, count: number): CalendarDay[] {
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY_MS);
      const iso = formatIsoDate(date);
      return { iso, day: jstParts(date).day, weekOffset, isToday: iso === todayIso };
    });
  }

  for (let offset = oldestOffset; offset <= 0; offset++) {
    const range = getWeekRange(offset, now);
    monthFor(range.start).weeks.push({ weekNumber: getIsoWeekNumber(range.start), days: buildDays(range.start, offset, 7) });
  }

  // 選べる範囲より後ろ（今週より先）を、選択不可の行で当月末まで埋める。
  const newestWeekEnd = getWeekRange(0, now).end;
  const { year: targetYear, month: targetMonth } = jstParts(newestWeekEnd);
  let cursor = newestWeekEnd;
  while (jstParts(cursor).year === targetYear && jstParts(cursor).month === targetMonth) {
    const { year, month, day } = jstParts(cursor);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const rowLength = Math.min(7, daysInMonth - day + 1);
    monthFor(cursor).weeks.push({ weekNumber: getIsoWeekNumber(cursor), days: buildDays(cursor, null, rowLength) });
    cursor = new Date(cursor.getTime() + rowLength * DAY_MS);
  }

  return months;
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
