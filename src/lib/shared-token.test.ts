import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSharedToken } from "./shared-token.ts";

const base = { baseUrl: "https://deck.example/", secret: "bearer-secret" };

function okFetch(value: unknown, calls: { url: string; headers: Record<string, string> }[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify({ name: "X", value }), { status: 200 });
  }) as unknown as typeof fetch;
}

test("利用元とBearerを付けて取得し、キャッシュを返す", async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const r = await resolveSharedToken("A B", null, { ...base, now: 1000, fetchImpl: okFetch("v1", calls) });
  assert.equal(r.value, "v1");
  assert.deepEqual(r.cache, { value: "v1", fetchedAtMs: 1000 });
  assert.equal(calls[0].url, "https://deck.example/api/shared-tokens?name=A%20B");
  assert.equal(calls[0].headers.authorization, "Bearer bearer-secret");
  assert.equal(calls[0].headers["x-shared-token-consumer"], "research-desk");
});

test("キャッシュが新しい間は取得しない", async () => {
  const prev = { value: "old", fetchedAtMs: 1000 };
  const fetchImpl = (async () => {
    throw new Error("呼ばれない");
  }) as unknown as typeof fetch;
  const r = await resolveSharedToken("A", prev, { ...base, now: 1000 + 60_000, fetchImpl });
  assert.equal(r.value, "old");
});

test("期限切れで取得に失敗したら直前の値を使う（値は出力しない）", async () => {
  const prev = { value: "old", fetchedAtMs: 0 };
  const fetchImpl = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logs.push(args.join(" "));
  try {
    const r = await resolveSharedToken("A", prev, { ...base, now: 20 * 60_000, fetchImpl });
    assert.equal(r.value, "old");
    assert.equal(r.cache, prev);
  } finally {
    console.error = original;
  }
  assert.ok(logs.length === 1);
  assert.ok(!logs[0].includes("bearer-secret") && !logs[0].includes("old"));
});

test("キャッシュも無く失敗したら null（呼び出し側が環境変数へ倒す）", async () => {
  const fetchImpl = (async () => {
    throw new Error("network bearer-secret");
  }) as unknown as typeof fetch;
  const original = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => logs.push(args.join(" "));
  try {
    const r = await resolveSharedToken("A", null, { ...base, fetchImpl });
    assert.equal(r.value, null);
  } finally {
    console.error = original;
  }
  assert.ok(!logs.join("").includes("bearer-secret"));
});

test("SHARED_TOKEN_API_SECRET・URLが未設定なら取得を試みない", async () => {
  const fetchImpl = (async () => {
    throw new Error("呼ばれない");
  }) as unknown as typeof fetch;
  const r = await resolveSharedToken("A", null, { baseUrl: "", secret: "", fetchImpl });
  assert.equal(r.value, null);
});

test("value が文字列でない応答は失敗として扱う", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const r = await resolveSharedToken("A", null, { ...base, fetchImpl: okFetch(123) });
    assert.equal(r.value, null);
  } finally {
    console.error = original;
  }
});
