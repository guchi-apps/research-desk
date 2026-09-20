import { NextResponse, type NextRequest } from "next/server";
import { isRetryableAuthError } from "@/lib/auth-error";
import { DEV_LOGIN_COOKIE_NAME, verifyDevLoginCookieValue } from "@/lib/dev-login";
import { getRequestOrigin } from "@/lib/request-origin";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16ではmiddleware.tsではなくproxy.tsを使う
// （guchi-apps/docs の knowledge/nextjs-prisma.md）。
export default async function proxy(request: NextRequest) {
  const bypassEmail = verifyDevLoginCookieValue(request.cookies.get(DEV_LOGIN_COOKIE_NAME)?.value);
  if (bypassEmail) {
    return NextResponse.next();
  }

  const { response, user, error } = await updateSession(request);
  if (!user) {
    // 通信不達・429は未ログインではなく「今は確認できない」なので、ログイン画面へ差し戻さずに通す。
    // 判定はページ側のgetCurrentUser()が同じ基準で行い、`unavailable`の画面を出す。
    if (isRetryableAuthError(error)) {
      return response;
    }
    // request.url は待受アドレス（localhost:<PORT>）なので、リダイレクト先の組み立てには使わない
    // （src/lib/request-origin.ts）。
    return NextResponse.redirect(`${getRequestOrigin(request)}/login`);
  }

  return response;
}

export const config = {
  // トップ画面（`/`）と/dashboard配下だけを対象にする。全経路を対象にすると静的アセット
  // （アイコン等）の除外漏れを踏みやすいため、保護対象を絞って回避する
  // （guchi-apps/docs の knowledge/nextjs-prisma.md「public/の静的ファイルはproxy.tsのmatcherに掛かる」）。
  matcher: ["/", "/dashboard/:path*"],
};
