import { NextResponse, type NextRequest } from "next/server";
import { DEV_LOGIN_COOKIE_NAME, verifyDevLoginCookieValue } from "@/lib/dev-login";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16ではmiddleware.tsではなくproxy.tsを使う
// （guchi-apps/docs の knowledge/nextjs-prisma.md）。
export default async function proxy(request: NextRequest) {
  const bypassEmail = verifyDevLoginCookieValue(request.cookies.get(DEV_LOGIN_COOKIE_NAME)?.value);
  if (bypassEmail) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  // /dashboard配下だけを対象にする。全経路を対象にすると静的アセット（アイコン等）の
  // 除外漏れを踏みやすいため、保護対象を絞って回避する
  // （guchi-apps/docs の knowledge/nextjs-prisma.md「public/の静的ファイルはproxy.tsのmatcherに掛かる」）。
  matcher: ["/dashboard/:path*"],
};
