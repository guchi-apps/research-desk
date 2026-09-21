import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasCollectionCronSecret } from "@/lib/internal-auth";
import { notifyNewCandidates } from "@/lib/aide-bot-notice";
import { runDailyCollection } from "@/lib/collection";
import { enqueueCollectionSearch } from "@/lib/collection-search";
import { getRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const fromCron = hasCollectionCronSecret(request);
  const authenticated = fromCron || (await getCurrentUser()).status === "authenticated";
  if (!authenticated) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // RSSの収集に加えて、Codex（Web検索）による収集ジョブを積む。実行はVPS上のポーラーが後から行い、
  // ここでは待たない。RSSの収集が例外で落ちてもジョブは積まれるよう、先に積む。積めなくても
  // RSSの収集結果は成功のまま返す（原因はサーバーログへ）。
  const collectionSearch = await queueCollectionSearch(fromCron ? "cron" : "manual");
  try {
    const result = await runDailyCollection();
    await notifyNewCandidates(result, `${getRequestOrigin(request)}/dashboard`);
    return NextResponse.json({ ...result, collectionSearch });
  } catch (error) {
    // Prismaの生のエラー文などを応答へ載せない。詳細はサーバーログへ出す（#170）。
    console.error("日次収集に失敗しました", error);
    return NextResponse.json({ error: "collection_failed" }, { status: 500 });
  }
}

async function queueCollectionSearch(requestedBy: string): Promise<"queued" | "already_queued" | "failed"> {
  try {
    const queued = await enqueueCollectionSearch(requestedBy);
    return queued.ok ? "queued" : queued.reason;
  } catch (error) {
    console.error("収集ジョブを積めませんでした", error);
    return "failed";
  }
}
