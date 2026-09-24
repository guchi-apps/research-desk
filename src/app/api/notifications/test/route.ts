import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getVapidPublicKey, sendPushToAll } from "@/lib/push-notice";
import { NEW_ARTICLES_URL } from "@/lib/push-rules";

export const runtime = "nodejs";

/** 設定画面の「テスト通知」。登録済みの全端末へ送る */
export async function POST() {
  if ((await getCurrentUser()).status !== "authenticated") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!getVapidPublicKey()) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  try {
    const result = await sendPushToAll({
      title: "テスト通知",
      body: "新着記事の通知はこのように届きます。",
      url: NEW_ARTICLES_URL,
      tag: "research-desk-test",
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("テスト通知に失敗しました", error);
    return NextResponse.json({ error: "push_failed" }, { status: 500 });
  }
}
