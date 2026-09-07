import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildImageMailZipFileName } from "./image-mail-zip-filename.ts";

describe("buildImageMailZipFileName", () => {
  it("YY:MM:DD タイトル.zip の形式にする（JST基準）", () => {
    const now = new Date("2026-08-10T03:00:00Z"); // JSTで2026-08-10 12:00
    assert.equal(buildImageMailZipFileName("テスト", now), "26:08:10 テスト.zip");
  });

  it("JSTで日付が繰り上がる時刻も正しく変換する", () => {
    const now = new Date("2026-08-09T15:30:00Z"); // JSTで2026-08-10 00:30
    assert.equal(buildImageMailZipFileName("テスト", now), "26:08:10 テスト.zip");
  });

  it("1桁の月日は0埋めする", () => {
    const now = new Date("2026-01-05T00:00:00Z"); // JSTで2026-01-05 09:00
    assert.equal(buildImageMailZipFileName("現場点検", now), "26:01:05 現場点検.zip");
  });
});
