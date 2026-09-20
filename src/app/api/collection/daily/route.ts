import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasCollectionCronSecret } from "@/lib/internal-auth";
import { notifyNewCandidates } from "@/lib/aide-bot-notice";
import { runDailyCollection } from "@/lib/collection";
import { getRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authenticated = hasCollectionCronSecret(request) || (await getCurrentUser()).status === "authenticated";
  if (!authenticated) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runDailyCollection();
    await notifyNewCandidates(result, `${getRequestOrigin(request)}/dashboard`);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "collection_failed" }, { status: 500 });
  }
}
