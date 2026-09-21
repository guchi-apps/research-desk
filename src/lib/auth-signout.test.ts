import assert from "node:assert/strict";
import { test } from "node:test";
import { signOutThisApp } from "./auth-signout.ts";

test("通常ログアウトはscope: localでsignOutを呼ぶ（他アプリのセッションを失効させない）", async () => {
  const calls: unknown[][] = [];
  const supabase = {
    auth: {
      signOut: async (...args: unknown[]) => {
        calls.push(args);
        return { error: null };
      },
    },
  };

  await signOutThisApp(supabase);

  assert.deepEqual(calls, [[{ scope: "local" }]]);
});
