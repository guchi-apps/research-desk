import assert from "node:assert/strict";
import { test } from "node:test";
import { insertChangelogEntry, parseReleaseChangelog } from "../../scripts/version-changelog.mjs";

const BASE = `export type ChangelogEntry = { version: string };
export const APP_CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-01-01",
    changes: [
      "初回リリース",
    ],
  },
];
`;

test("変更内容があれば先頭へエントリを追加する", () => {
  const result = insertChangelogEntry(BASE, "1.1.0", "2026-02-01", ["新機能を追加しました"], [
    "1. 画面を開く",
  ]);
  assert.equal(result.inserted, true);
  assert.match(result.content, /version: "1\.1\.0"/);
  assert.match(result.content, /"新機能を追加しました",/);
  assert.match(result.content, /usage: \[\n\s+"1\. 画面を開く",/);
  assert.ok(result.content.indexOf('"1.1.0"') < result.content.indexOf('"1.0.0"'));
});

test("変更内容が空ならエントリを作らない", () => {
  const result = insertChangelogEntry(BASE, "1.1.0", "2026-02-01", [], []);
  assert.equal(result.inserted, false);
  assert.equal(result.content, BASE);
});

test("使い方だけあっても変更内容が空ならエントリを作らない", () => {
  const result = insertChangelogEntry(BASE, "1.1.0", "2026-02-01", [], ["1. 画面を開く"]);
  assert.equal(result.inserted, false);
  assert.equal(result.content, BASE);
});

test("変更内容が空でもマーカーが無ければ失敗する", () => {
  assert.throws(
    () => insertChangelogEntry("export const OTHER = [];\n", "1.1.0", "2026-02-01", [], []),
    /marker not found/,
  );
});

test("同じバージョンが既にあれば追加しない", () => {
  const result = insertChangelogEntry(BASE, "1.0.0", "2026-02-01", ["重複"], []);
  assert.equal(result.inserted, false);
  assert.equal(result.content, BASE);
});

test("RELEASE_CHANGELOGが未設定・空白だけなら空配列になる", () => {
  assert.deepEqual(parseReleaseChangelog(undefined), []);
  assert.deepEqual(parseReleaseChangelog("  \n \n"), []);
});
