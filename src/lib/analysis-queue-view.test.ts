import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatClock, formatDuration, formatLeaseRemaining, formatSnapshotTime, leaseProgress, orderQueue, startOfJstDay } from "./analysis-queue-view.ts";

describe("formatDuration", () => {
  it("1分未満は秒だけ、1時間未満は分と秒、それ以上は時間と分で出す", () => {
    assert.equal(formatDuration(58_400), "58秒");
    assert.equal(formatDuration(192_000), "3分12秒");
    assert.equal(formatDuration(65 * 60_000 + 30_000), "1時間5分");
  });

  it("時計のずれで負になっても0秒として出す", () => {
    assert.equal(formatDuration(-5_000), "0秒");
  });
});

describe("formatClock / formatSnapshotTime", () => {
  it("サーバーのタイムゾーンに関わらずJSTで出す", () => {
    const date = new Date("2026-09-17T05:32:10Z");
    assert.equal(formatClock(date), "14:32");
    assert.equal(formatSnapshotTime(date), "9/17 14:32:10");
  });
});

describe("formatLeaseRemaining", () => {
  const now = new Date("2026-09-17T05:00:00Z");

  it("残り時間を分単位で切り上げて出す", () => {
    assert.equal(formatLeaseRemaining(new Date("2026-09-17T05:10:30Z"), now), "期限まで 11分");
  });

  it("期限を過ぎていたら積み直される旨を出す", () => {
    assert.equal(formatLeaseRemaining(new Date("2026-09-17T04:59:00Z"), now), "期限切れ（次の取得で積み直し）");
  });
});

describe("leaseProgress", () => {
  const startedAt = new Date("2026-09-17T05:00:00Z");
  const leaseExpiresAt = new Date("2026-09-17T05:15:00Z");

  it("取得から期限までのうち経過した割合を返す", () => {
    assert.equal(leaseProgress(startedAt, leaseExpiresAt, new Date("2026-09-17T05:03:00Z")), 0.2);
  });

  it("0〜1の範囲に収める", () => {
    assert.equal(leaseProgress(startedAt, leaseExpiresAt, new Date("2026-09-17T04:59:00Z")), 0);
    assert.equal(leaseProgress(startedAt, leaseExpiresAt, new Date("2026-09-17T05:30:00Z")), 1);
    assert.equal(leaseProgress(null, leaseExpiresAt, startedAt), 0);
  });
});

describe("startOfJstDay", () => {
  it("JSTの日付が変わった直後はその日の0時を返す", () => {
    assert.equal(startOfJstDay(new Date("2026-09-16T15:30:00Z")).toISOString(), "2026-09-16T15:00:00.000Z");
  });

  it("JSTの23時台は同じ日の0時を返す（UTCでは前日になる時間帯）", () => {
    assert.equal(startOfJstDay(new Date("2026-09-17T14:59:00Z")).toISOString(), "2026-09-16T15:00:00.000Z");
  });
});

describe("orderQueue", () => {
  it("記事を古い順に並べ、週の総括は積んだ時刻に関わらず記事の後ろへ回す", () => {
    const entries = [
      { id: "b1", kind: "weekly_brief" as const, queuedAt: new Date("2026-09-17T05:00:00Z") },
      { id: "a2", kind: "article" as const, queuedAt: new Date("2026-09-17T05:05:00Z") },
      { id: "a1", kind: "article" as const, queuedAt: new Date("2026-09-17T05:01:00Z") },
    ];
    assert.deepEqual(orderQueue(entries).map((entry) => entry.id), ["a1", "a2", "b1"]);
  });
});
