import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideDailyRunStatus, fitsNormalizedUrlColumn, MAX_NORMALIZED_URL_LENGTH } from "./collection-rules.ts";

describe("fitsNormalizedUrlColumn", () => {
  it("列幅ちょうどのURLは収まる", () => {
    assert.equal(fitsNormalizedUrlColumn("h".repeat(MAX_NORMALIZED_URL_LENGTH)), true);
  });

  it("列幅を1文字でも超えるURLは収まらない", () => {
    assert.equal(fitsNormalizedUrlColumn("h".repeat(MAX_NORMALIZED_URL_LENGTH + 1)), false);
  });
});

describe("decideDailyRunStatus", () => {
  const base = { feedCount: 3, feedFailures: 0, selectedCount: 10, articleFailures: 0 };

  it("失敗が無ければSUCCEEDED", () => {
    assert.equal(decideDailyRunStatus(base), "SUCCEEDED");
  });

  it("候補が0件でもフィードが取れていればSUCCEEDED", () => {
    assert.equal(decideDailyRunStatus({ ...base, selectedCount: 0 }), "SUCCEEDED");
  });

  it("フィードの一部が取れなければPARTIAL", () => {
    assert.equal(decideDailyRunStatus({ ...base, feedFailures: 1 }), "PARTIAL");
  });

  it("フィードが全部取れなければFAILED", () => {
    assert.equal(decideDailyRunStatus({ ...base, feedFailures: 3, selectedCount: 0 }), "FAILED");
  });

  it("記事の登録が1件だけ失敗ならPARTIAL", () => {
    assert.equal(decideDailyRunStatus({ ...base, articleFailures: 1 }), "PARTIAL");
  });

  it("登録しようとした記事が全部失敗ならFAILED", () => {
    assert.equal(decideDailyRunStatus({ ...base, articleFailures: 10 }), "FAILED");
  });
});
