import { claimAnalysisJobs, MAX_CLAIM_JOBS } from "@/lib/article-analysis";
import { json, requireAnalysisWorkerSecret } from "@/lib/internal-auth";

export const runtime = "nodejs";

/**
 * サブPCの常駐ポーラーが解析ジョブを取りに来る口（#79）。
 *
 * 応答にはプロンプトと出力スキーマを載せる。ポーラーは受け取った文面を`codex exec`へ流すだけの
 * 実行役で、解析の観点を変えてもサブPCへスクリプトを配り直さずに済むようにしてある。
 * 記事本文はプロンプトの中にだけ入り、ログへは出さない。
 */
export async function POST(request: Request) {
  const denied = requireAnalysisWorkerSecret(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (typeof body !== "object" || body === null) return json({ error: "invalid_body" }, 400);

  const input = body as Record<string, unknown>;
  const host = typeof input.host === "string" && input.host.trim() !== "" ? input.host.trim().slice(0, 64) : null;
  if (!host) return json({ error: "host_required" }, 400);

  const requested = typeof input.maxJobs === "number" && Number.isInteger(input.maxJobs) ? input.maxJobs : 1;
  const jobs = await claimAnalysisJobs({
    host,
    maxJobs: Math.min(Math.max(requested, 0), MAX_CLAIM_JOBS),
    codexAuthMode: typeof input.codexAuthMode === "string" ? input.codexAuthMode.slice(0, 32) : null,
    codexVersion: typeof input.codexVersion === "string" ? input.codexVersion.slice(0, 64) : null,
  });

  return json({ jobs }, 200);
}
