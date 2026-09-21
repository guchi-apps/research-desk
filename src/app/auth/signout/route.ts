import { NextResponse } from "next/server";
import { signOutThisApp } from "@/lib/auth-signout";
import { getRequestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const supabase = await createClient();
  // 引数なしのsignOut()はglobal scopeで、共有Supabaseの他アプリ・他端末まで失効させる
  await signOutThisApp(supabase);

  return NextResponse.redirect(`${origin}/login`);
}
