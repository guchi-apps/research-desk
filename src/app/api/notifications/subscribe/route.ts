import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deletePushSubscription, getVapidPublicKey, savePushSubscription } from "@/lib/push-notice";
import { parseSubscriptionBody } from "@/lib/push-rules";

export const runtime = "nodejs";

async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()).status === "authenticated";
}

/** 購読に使う公開鍵を返す。未設定ならnull（画面は通知を無効表示にする） */
export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

/** この端末の購読を保存する（同じendpointなら上書き） */
export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const subscription = parseSubscriptionBody(await request.json().catch(() => null));
  if (!subscription) return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  await savePushSubscription(subscription, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
}

/** この端末の購読を解除する */
export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string" || !body.endpoint) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }
  await deletePushSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
