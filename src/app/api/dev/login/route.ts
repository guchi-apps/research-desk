import { NextResponse } from "next/server";
import { DEV_LOGIN_COOKIE_NAME, devLoginCookieValue, isDevLoginBypassEnabled } from "@/lib/dev-login";
import { getRequestOrigin, safeNextPath } from "@/lib/request-origin";

// CI（Playwrightでのスクリーンショット撮影）・ローカル開発専用の認証バイパス導線。
// NODE_ENV==="production"、またはCI_LOGIN_BYPASS_SECRET未設定では常に404にする
// （guchi-apps/docs の standards/dev-environment.md）。
export async function GET(request: Request) {
  if (!isDevLoginBypassEnabled()) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const value = devLoginCookieValue();
  if (!value) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const origin = getRequestOrigin(request);
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  const response = NextResponse.redirect(`${origin}${next}`);

  response.cookies.set(DEV_LOGIN_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return response;
}
