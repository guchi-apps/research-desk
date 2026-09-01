import { NextResponse } from "next/server";
import { enqueueAnalysisJob } from "@/lib/article-analysis";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * 画面の「AI解析」「再解析」から解析ジョブを積む（#79）。
 *
 * 呼び出し元はブラウザなので、`/api/internal/*`の共有シークレットではなくSupabaseのセッションで
 * 認証する（`/api/image-mail/send`と同じ考え方）。実際に解析するのはサブPCのポーラーで、
 * ここはキューに載せるところまでしか行わない。
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
  const articleId = typeof body === "object" && body !== null ? (body as Record<string, unknown>).articleId : null;
  if (typeof articleId !== "string" || articleId === "") return NextResponse.json({ error: "article_required" }, { status: 400 });

  const result = await enqueueAnalysisJob(articleId, user.user.email);
  if (!result.ok) {
    // 同じ記事の解析が既に走っている場合は409。画面は「解析中」の表示のまま何も足さない。
    return NextResponse.json({ error: result.reason }, { status: result.reason === "not_found" ? 404 : 409 });
  }
  return NextResponse.json({ jobId: result.jobId, attempt: result.attempt }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
