import { cookies } from "next/headers";
import { DEV_LOGIN_COOKIE_NAME, verifyDevLoginCookieValue } from "@/lib/dev-login";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { email: string };

export type CurrentUserResult =
  | { status: "authenticated"; user: CurrentUser }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

function isAllowedEmail(email: string): boolean {
  const allowed = (process.env.ALLOWED_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(email);
}

// SupabaseへのリクエストがSDK内部で失敗すると、getUser()は未ログインと同じ user: null を返す。
// 通信不達（AuthRetryableFetchError）とレート制限（429）は「今は確認できない」として区別しないと、
// 電波の悪い場所で開いただけの利用者がログイン画面へ差し戻される
// （guchi-apps/docs の knowledge/supabase.md）。isAuthRetryableFetchErrorは@supabase/supabase-jsから
// 再公開されていないため、判定を自前で持つ。
function isRetryableAuthError(error: { name?: string; status?: number } | null): boolean {
  if (!error) return false;
  return error.name === "AuthRetryableFetchError" || error.status === 429;
}

async function getDevLoginEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifyDevLoginCookieValue(cookieStore.get(DEV_LOGIN_COOKIE_NAME)?.value);
}

export async function getCurrentUser(): Promise<CurrentUserResult> {
  const devLoginEmail = await getDevLoginEmail();
  if (devLoginEmail) {
    return { status: "authenticated", user: { email: devLoginEmail } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (isRetryableAuthError(error)) {
      return { status: "unavailable" };
    }
    return { status: "unauthenticated" };
  }

  const email = data.user?.email;
  if (!email || !isAllowedEmail(email)) {
    return { status: "unauthenticated" };
  }

  return { status: "authenticated", user: { email } };
}
