import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeFeature, UNKNOWN_MODEL } from "./ai-usage.ts";

const now = new Date("2026-09-25T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

test("記録が無ければ空配列", () => {
  assert.deepEqual(summarizeFeature("記事のAI解析", [], now), []);
});

test("24時間・7日間をモデル別に数え、7日より古い記録は除く", () => {
  const rows = summarizeFeature(
    "記事のAI解析",
    [
      { model: "gpt-5", at: hoursAgo(1) },
      { model: "gpt-5", at: hoursAgo(30) },
      { model: "gpt-5", at: hoursAgo(24 * 8) },
      { model: "gpt-5-mini", at: hoursAgo(2) },
    ],
    now,
  );
  assert.deepEqual(rows, [
    { label: "記事のAI解析", model: "gpt-5", last24h: { calls: 1 }, last7d: { calls: 2 } },
    { label: "記事のAI解析", model: "gpt-5-mini", last24h: { calls: 1 }, last7d: { calls: 1 } },
  ]);
});

test("modelがnull・空文字の行は固定IDに合算する", () => {
  const rows = summarizeFeature("週の総括", [{ model: null, at: hoursAgo(1) }, { model: " ", at: hoursAgo(50) }], now);
  assert.deepEqual(rows, [{ label: "週の総括", model: UNKNOWN_MODEL, last24h: { calls: 1 }, last7d: { calls: 2 } }]);
});
