import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNewsMailPickPath,
  buildSharePagePath,
  extractUrl,
  fallbackArticleTitle,
  hasPendingShare,
  normalizeSharedText,
  putShareEntry,
  takeShareEntry,
  SHARE_INBOX_MAX_ENTRIES,
  SHARE_INBOX_MAX_FILES,
  SHARE_INBOX_MAX_TOTAL_BYTES,
  SHARE_INBOX_TTL_MS,
  type ShareInboxEntry,
  type SharedFile,
} from "./share-inbox.ts";

const photo = (bytes = 10): SharedFile => ({ name: "a.jpg", type: "image/jpeg", data: new Uint8Array(bytes) });

describe("putShareEntry / takeShareEntry", () => {
  it("置いた写真は一度だけ取り出せる", () => {
    const store = new Map<string, ShareInboxEntry>();
    const put = putShareEntry(store, { title: " 現場 ", files: [photo(), photo()] }, 0, "x");
    assert.deepEqual(put, { ok: true, id: "x" });
    const taken = takeShareEntry(store, "x", 1);
    assert.equal(taken?.title, "現場");
    assert.equal(taken?.files.length, 2);
    assert.equal(takeShareEntry(store, "x", 2), null);
  });

  it("idを省くと一番新しいものを取り出す", () => {
    const store = new Map<string, ShareInboxEntry>();
    putShareEntry(store, { title: "古い", files: [photo()] }, 0, "a");
    putShareEntry(store, { title: "新しい", files: [photo()] }, 1, "b");
    assert.equal(takeShareEntry(store, null, 2)?.id, "b");
  });

  it("期限を過ぎたものは取り出せない", () => {
    const store = new Map<string, ShareInboxEntry>();
    putShareEntry(store, { title: "", files: [photo()] }, 0, "a");
    assert.equal(hasPendingShare(store, SHARE_INBOX_TTL_MS), true);
    assert.equal(takeShareEntry(store, "a", SHARE_INBOX_TTL_MS + 1), null);
    assert.equal(store.size, 0);
  });

  it("件数の上限を超えると古いものから捨てる", () => {
    const store = new Map<string, ShareInboxEntry>();
    for (let i = 0; i <= SHARE_INBOX_MAX_ENTRIES; i++) putShareEntry(store, { title: "", files: [photo()] }, i, `e${i}`);
    assert.equal(store.size, SHARE_INBOX_MAX_ENTRIES);
    assert.equal(store.has("e0"), false);
  });

  it("枚数・合計サイズ・画像以外を断る", () => {
    const store = new Map<string, ShareInboxEntry>();
    assert.deepEqual(putShareEntry(store, { title: "", files: [] }, 0), { ok: false, reason: "no_files" });
    assert.deepEqual(putShareEntry(store, { title: "", files: Array.from({ length: SHARE_INBOX_MAX_FILES + 1 }, () => photo()) }, 0), { ok: false, reason: "too_many_files" });
    assert.deepEqual(putShareEntry(store, { title: "", files: [photo(SHARE_INBOX_MAX_TOTAL_BYTES + 1)] }, 0), { ok: false, reason: "too_large" });
    assert.deepEqual(putShareEntry(store, { title: "", files: [{ name: "a.pdf", type: "application/pdf", data: new Uint8Array(1) }] }, 0), { ok: false, reason: "not_image" });
    assert.equal(store.size, 0);
  });
});

describe("normalizeSharedText", () => {
  it("urlが空なら文章からURLを拾い、文章からは取り除く", () => {
    assert.deepEqual(normalizeSharedText({ title: "", text: "駅ナカにロッカー増設 https://example.com/news/1?utm_source=x", url: "" }), {
      title: "",
      text: "駅ナカにロッカー増設",
      url: "https://example.com/news/1?utm_source=x",
    });
  });

  it("urlと文章が同じなら文章は空にする", () => {
    assert.deepEqual(normalizeSharedText({ title: "記事", text: "https://example.com/a", url: "https://example.com/a" }), { title: "記事", text: "", url: "https://example.com/a" });
  });

  it("http(s)以外のURLは記事として扱わない", () => {
    assert.equal(normalizeSharedText({ url: "javascript:alert(1)" }).url, null);
    assert.equal(extractUrl("メモだけ"), null);
  });

  it("URLの末尾の句読点は含めない", () => {
    assert.equal(extractUrl("こちら https://example.com/a。"), "https://example.com/a");
  });
});

describe("buildSharePagePath / fallbackArticleTitle", () => {
  it("共有された内容をクエリにする", () => {
    assert.equal(buildSharePagePath({ title: "記事", text: "", url: "https://example.com/a" }), "/dashboard/share?url=https%3A%2F%2Fexample.com%2Fa&title=%E8%A8%98%E4%BA%8B");
    assert.equal(buildSharePagePath({ title: "", text: "", url: null }), "/dashboard/share");
  });

  it("タイトルが無ければ文章の1行目、それも無ければホスト名を使う", () => {
    assert.equal(fallbackArticleTitle({ title: "", text: "一行目\n二行目", url: "https://example.com/a" }), "一行目");
    assert.equal(fallbackArticleTitle({ title: "", text: "", url: "https://www.example.com/a" }), "www.example.com");
  });
});

describe("buildNewsMailPickPath", () => {
  const now = new Date("2026-09-17T03:00:00Z"); // JSTの木曜
  it("記事の日付が入っている週を開く", () => {
    assert.equal(buildNewsMailPickPath("a1", new Date("2026-09-16T00:00:00Z"), now), "/dashboard/news-mail?week=0&basis=either&triage=all&pick=a1");
    assert.equal(buildNewsMailPickPath("a1", new Date("2026-09-08T00:00:00Z"), now), "/dashboard/news-mail?week=-1&basis=either&triage=all&pick=a1");
  });
  it("遡れる範囲より古ければ今週にする", () => {
    assert.match(buildNewsMailPickPath("a1", new Date("2025-01-01T00:00:00Z"), now), /week=0&/);
  });
});
