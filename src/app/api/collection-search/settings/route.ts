import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCollectionSearchPolicy, requestCollectionSearchPolicyAdjustment } from "@/lib/collection-search-settings";

export const runtime = "nodejs";

async function authorized() {
  const user = await getCurrentUser();
  return user.status === "authenticated" ? null : NextResponse.json({ error: "unauthorized" }, { status: user.status === "unavailable" ? 503 : 401 });
}

export async function GET() {
  const denied = await authorized();
  if (denied) return denied;
  const value = await getCollectionSearchPolicy();
  return NextResponse.json({ policy: value.policy, pendingInstruction: value.pendingInstruction, updatedAt: value.updatedAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const denied = await authorized();
  if (denied) return denied;
  const body: unknown = await request.json().catch(() => null);
  const instruction = typeof (body as { instruction?: unknown } | null)?.instruction === "string" ? (body as { instruction: string }).instruction : "";
  const value = await requestCollectionSearchPolicyAdjustment(instruction);
  if (!value) return NextResponse.json({ error: "invalid_instruction" }, { status: 400 });
  return NextResponse.json({ policy: value.policy, pendingInstruction: value.pendingInstruction, updatedAt: value.updatedAt.toISOString() });
}
