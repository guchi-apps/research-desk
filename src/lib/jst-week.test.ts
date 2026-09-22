import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWeekCalendarMonths, getIsoWeekNumber, getWeekRange, JST_OFFSET_MS, OLDEST_WEEK_OFFSET } from "./jst-week.ts";

const NOW = new Date("2026-09-08T03:00:00Z"); // JST 2026年9月8日 12:00（火）

describe("getWeekRange", () => {
  it("週の始まりはJSTの日曜0時", () => {
    const range = getWeekRange(0, NOW);
    assert.equal(range.start.toISOString(), "2026-09-05T15:00:00.000Z"); // JST 9/6 0:00
    assert.equal(range.end.toISOString(), "2026-09-12T15:00:00.000Z"); // JST 9/13 0:00
  });

  it("weekOffsetで1週ずつ遡れる", () => {
    const lastWeek = getWeekRange(-1, NOW);
    assert.equal(lastWeek.start.toISOString(), "2026-08-29T15:00:00.000Z"); // JST 8/30 0:00
    assert.equal(lastWeek.end.toISOString(), "2026-09-05T15:00:00.000Z");
  });
});

describe("getIsoWeekNumber", () => {
  it("年始のThursdayを含む週は第1週", () => {
    const jan1 = new Date(Date.UTC(2026, 0, 1) - JST_OFFSET_MS); // JST 2026-01-01 0:00
    assert.equal(getIsoWeekNumber(jan1), 1);
  });

  it("日曜始まりの週でも週番号は含まれる木曜日から求める", () => {
    const range = getWeekRange(0, NOW);
    assert.equal(getIsoWeekNumber(new Date(range.start.getTime() + 4 * 24 * 60 * 60 * 1000)), 37);
  });
});

describe("buildWeekCalendarMonths", () => {
  it("今週の行は日曜始まり・週番号が正しい", () => {
    const months = buildWeekCalendarMonths(NOW, OLDEST_WEEK_OFFSET);
    const allWeeks = months.flatMap((month) => month.weeks);
    const currentRow = allWeeks.find((row) => row.days.some((day) => day.weekOffset === 0));
    assert.ok(currentRow);
    assert.equal(currentRow?.days[0]?.iso, "2026-09-06");
    assert.equal(currentRow?.days.at(-1)?.iso, "2026-09-12");
    assert.equal(currentRow?.weekNumber, 37);
  });

  it("今日の日付にisTodayが立つ", () => {
    const months = buildWeekCalendarMonths(NOW, OLDEST_WEEK_OFFSET);
    const today = months.flatMap((month) => month.weeks).flatMap((row) => row.days).find((day) => day.isToday);
    assert.equal(today?.iso, "2026-09-08");
  });

  it("選べる範囲より先の日付はweekOffsetがnull", () => {
    const months = buildWeekCalendarMonths(NOW, OLDEST_WEEK_OFFSET);
    const future = months.flatMap((month) => month.weeks).flatMap((row) => row.days).find((day) => day.iso === "2026-09-13");
    assert.equal(future?.weekOffset, null);
  });

  it("最古の週（oldestOffset）にもweekOffsetが入る", () => {
    const months = buildWeekCalendarMonths(NOW, OLDEST_WEEK_OFFSET);
    const oldestRow = months.flatMap((month) => month.weeks).find((row) => row.days.some((day) => day.weekOffset === OLDEST_WEEK_OFFSET));
    assert.ok(oldestRow);
    assert.equal(oldestRow?.days[0]?.iso, "2026-07-12");
  });
});
