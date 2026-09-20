import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRetryableAuthError } from "./auth-error.ts";

describe("isRetryableAuthError", () => {
  it("通信不達（AuthRetryableFetchError）とレート制限（429）は再試行できるエラーとして扱う", () => {
    assert.equal(isRetryableAuthError({ name: "AuthRetryableFetchError", status: 0 }), true);
    assert.equal(isRetryableAuthError({ name: "AuthApiError", status: 429 }), true);
  });
  it("未ログイン（セッション無し）や認証失敗は再試行できるエラーに含めない", () => {
    assert.equal(isRetryableAuthError({ name: "AuthSessionMissingError", status: 400 }), false);
    assert.equal(isRetryableAuthError({ name: "AuthApiError", status: 401 }), false);
    assert.equal(isRetryableAuthError({}), false);
  });
  it("エラーが無いときは再試行の対象ではない", () => {
    assert.equal(isRetryableAuthError(null), false);
  });
});
