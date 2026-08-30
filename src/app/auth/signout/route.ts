import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(`${origin}/login`);
}
