import { NextResponse } from "next/server";
import { getRequestOrigin, safeNextPath } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // request.url は待受アドレス（localhost:<PORT>）を返すため、Hostヘッダーから組み立てる
  // （src/lib/request-origin.ts）。ここを間違えるとSupabaseへ渡すredirect_toが
  // 実在しないURLになり、ログインがSupabaseのSite URLへ飛ばされる（#14）。
  const origin = getRequestOrigin(request);
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/login?error=oauth_start_failed`);
  }

  return NextResponse.redirect(data.url);
}
