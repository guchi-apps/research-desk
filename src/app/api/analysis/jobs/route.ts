import { NextResponse } from "next/server";
import { enqueueAnalysisJob } from "@/lib/article-analysis";
import { getCurrentUser } from "@/lib/auth";
import { MAX_TRIAGE_IDS } from "@/lib/triage";

export const runtime = "nodejs";

/** 上限は`MAX_TRIAGE_IDS`（まとめて仕分ける操作）と揃える。1回のリクエストで積み過ぎないため。 */
const MAX_ENQUEUE_IDS = MAX_TRIAGE_IDS;

/** `articleId`（1件）と`articleIds`（複数）の両方を受け付ける。重複は1つにまとめる。 */
function parseArticleIds(input: Record<string, unknown>): string[] | null {
  const raw = Array.isArray(input.articleIds) ? input.articleIds : [input.articleId];
  const ids = [...new Set(raw.filter((id): id is string => typeof id === "string" && id.trim() !== ""))];
  return ids.length === 0 || ids.length > MAX_ENQUEUE_IDS ? null : ids;
}

/**
 * 画面の「AI解析」「再解析」から解析ジョブを積む（#79）。
 *
 * 呼び出し元はブラウザなので、`/api/internal/*`の共有シークレットではなくSupabaseのセッションで
 * 認証する（`/api/image-mail/send`と同じ考え方）。実際に解析するのはVPS上のポーラーで、
 * ここはキューに載せるところまでしか行わない。
 *
 * 週報メール画面（#110）の「未解析をまとめて解析する」からも呼ぶため、`articleIds`（配列）でも
 * 受け付ける。
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
  const articleIds = parseArticleIds(input);
  if (articleIds === null) return NextResponse.json({ error: "article_required" }, { status: 400 });

  // 1件だけのときは従来どおり結果をそのまま返す（記事詳細・カードのボタンがこの形を読む）。
  if (articleIds.length === 1) {
    const result = await enqueueAnalysisJob(articleIds[0], user.user.email);
    if (!result.ok) {
      // 同じ記事の解析が既に走っている場合は409。画面は「解析中」の表示のまま何も足さない。
      return NextResponse.json({ error: result.reason }, { status: result.reason === "not_found" ? 404 : 409 });
    }
    return NextResponse.json({ jobId: result.jobId, attempt: result.attempt, queued: 1 }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  // まとめて積む場合（#110の週報メール画面）は、既に走っているもの・消えた記事があっても
  // 全体を失敗にしない。積めた件数と積めなかった件数を返し、画面はその数だけを出す。
  let queued = 0;
  let skipped = 0;
  for (const articleId of articleIds) {
    const result = await enqueueAnalysisJob(articleId, user.user.email);
    if (result.ok) queued += 1;
    else skipped += 1;
  }
  return NextResponse.json({ queued, skipped }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
