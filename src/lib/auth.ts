import { cookies } from "next/headers";
import { isRetryableAuthError } from "@/lib/auth-error";
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
