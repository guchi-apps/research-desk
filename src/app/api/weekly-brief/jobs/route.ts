import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseWeekBasis } from "@/lib/industry-information";
import { OLDEST_WEEK_OFFSET } from "@/lib/jst-week";
import { enqueueWeeklyBrief } from "@/lib/weekly-brief";

export const runtime = "nodejs";

/**
 * 週報メール画面（#110）の「週の総括をAIに作らせる」から総括ジョブを積む。
 *
 * 記事の解析ジョブ（`/api/analysis/jobs`）と同じく、呼び出し元がブラウザなのでSupabaseの
 * セッションで認証する。実行するのはVPS上の常駐ポーラーで、ここはキューに載せるところまで。
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user.status === "unavailable") return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  if (user.status === "unauthenticated") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const weekOffset = typeof input.weekOffset === "number" && Number.isInteger(input.weekOffset) ? input.weekOffset : null;
  if (weekOffset === null || weekOffset > 0 || weekOffset < OLDEST_WEEK_OFFSET) return NextResponse.json({ error: "invalid_week" }, { status: 400 });

  const articleIds = Array.isArray(input.articleIds) ? input.articleIds.filter((id): id is string => typeof id === "string" && id.trim() !== "") : [];
  const result = await enqueueWeeklyBrief({ weekOffset, basis: parseWeekBasis(typeof input.basis === "string" ? input.basis : undefined), articleIds, requestedBy: user.user.email });

  if (!result.ok) {
    // 同じ週の総括が既に走っている場合は409。画面は「生成中」の表示のまま何も足さない。
    return NextResponse.json({ error: result.reason }, { status: result.reason === "no_articles" ? 400 : 409 });
  }
  return NextResponse.json({ jobId: result.jobId }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
