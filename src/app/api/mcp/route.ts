import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { importWeeklyReport, type WeeklyReportInput } from "@/lib/collection";

export const runtime = "nodejs";

const TOOL_NAME = "research_desk_import_weekly_report";
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const rateLimit = new Map<string, { startedAt: number; count: number }>();

function jsonRpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: unknown, code: number, message: string, data?: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
}

function authorized(request: Request): boolean {
  const expected = process.env.COLLECTION_MCP_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

function allowedByRateLimit(request: Request): boolean {
  const key = createHash("sha256").update(request.headers.get("authorization") ?? "mcp-client").digest("hex");
  const now = Date.now();
  const current = rateLimit.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    rateLimit.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count++;
  return current.count <= MAX_REQUESTS;
}

function validateInput(value: unknown): WeeklyReportInput {
  if (!value || typeof value !== "object") throw new Error("argumentsはオブジェクトで指定してください");
  const input = value as Partial<WeeklyReportInput>;
  if (typeof input.executedAt !== "string" || typeof input.targetFrom !== "string" || typeof input.targetTo !== "string") throw new Error("executedAt、targetFrom、targetToは必須です");
  if (!Array.isArray(input.articles) || input.articles.length > 6) throw new Error("articlesは1〜6件で指定してください");
  if (input.articles.length === 0) throw new Error("articlesを1件以上指定してください");
  const counts = { DELIVERY: 0, LOCKER: 0 };
  for (const [index, article] of input.articles.entries()) {
    if (!article || typeof article !== "object") throw new Error(`articles[${index}]が不正です`);
    const item = article as Record<string, unknown>;
    if (item.business !== "DELIVERY" && item.business !== "LOCKER") throw new Error(`articles[${index}].businessはDELIVERYまたはLOCKERで指定してください`);
    counts[item.business]++;
    if (counts[item.business] > 3) throw new Error("1事業あたりの記事は3件までです");
    for (const field of ["title", "url", "sourceName"]) if (typeof item[field] !== "string" || !item[field]) throw new Error(`articles[${index}].${field}は必須です`);
    for (const field of ["title", "sourceName"]) if ((item[field] as string).length > 500) throw new Error(`articles[${index}].${field}が長すぎます`);
    if ((item.url as string).length > 2048) throw new Error(`articles[${index}].urlが長すぎます`);
    try { new URL(item.url as string); } catch { throw new Error(`articles[${index}].urlが不正です`); }
    if (typeof item.informationType !== "string" || !["NEW_PRODUCT", "COMPETITOR", "INTRODUCTION_CASE", "RECRUITMENT_PARTNERSHIP", "POLICY_SUBSIDY", "MARKET_STATISTICS", "USER_ISSUE", "CONSTRUCTION", "QUALITY_SAFETY", "PATENT", "OVERSEAS_CASE", "OTHER"].includes(item.informationType)) throw new Error(`articles[${index}].informationTypeが不正です`);
    if (item.importance !== undefined && !["HIGH", "MEDIUM", "REFERENCE"].includes(item.importance as string)) throw new Error(`articles[${index}].importanceが不正です`);
    if (item.periodScope !== undefined && !["IN_SCOPE", "PAST_30_DAYS_SUPPLEMENT"].includes(item.periodScope as string)) throw new Error(`articles[${index}].periodScopeが不正です`);
    for (const field of ["publishedAt", "occurredAt"]) if (item[field] !== undefined && item[field] !== null && (typeof item[field] !== "string" || Number.isNaN(new Date(item[field]).getTime())) ) throw new Error(`articles[${index}].${field}が不正です`);
    for (const field of ["keywords", "tags"]) if (item[field] !== undefined && (!Array.isArray(item[field]) || item[field].some((value) => typeof value !== "string"))) throw new Error(`articles[${index}].${field}が不正です`);
  }
  return input as WeeklyReportInput;
}

const TOOL = { name: TOOL_NAME, description: "ChatGPTが整理した宅配・ロッカー業界の週報記事をResearch Deskへ冪等に登録します。", inputSchema: {
  type: "object", additionalProperties: false, required: ["executedAt", "targetFrom", "targetTo", "articles"], properties: {
    executedAt: { type: "string", format: "date-time" }, targetFrom: { type: "string", format: "date-time" }, targetTo: { type: "string", format: "date-time" },
    articles: { type: "array", minItems: 1, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["business", "informationType", "title", "url", "sourceName"], properties: {
      business: { type: "string", enum: ["DELIVERY", "LOCKER"] }, informationType: { type: "string" }, title: { type: "string" }, url: { type: "string", format: "uri" }, sourceName: { type: "string" }, publisher: { type: ["string", "null"] }, isPrimarySource: { type: "boolean" }, publishedAt: { type: ["string", "null"], format: "date-time" }, occurredAt: { type: ["string", "null"], format: "date-time" }, summary: { type: ["string", "null"] }, content: { type: ["string", "null"] }, extractedMetrics: { type: ["object", "null"] }, implications: { type: ["string", "null"] }, importance: { type: "string", enum: ["HIGH", "MEDIUM", "REFERENCE"] }, targetCompany: { type: ["string", "null"] }, targetProduct: { type: ["string", "null"] }, keywords: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } }, periodScope: { type: "string", enum: ["IN_SCOPE", "PAST_30_DAYS_SUPPLEMENT"] },
    } } },
  },
} };

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  if (!allowedByRateLimit(request)) return NextResponse.json({ error: "呼び出し回数の上限を超えました。しばらく待ってから再試行してください" }, { status: 429 });
  let body: { id?: unknown; method?: string; params?: { name?: string; arguments?: unknown } };
  try { body = await request.json(); } catch { return jsonRpcError(null, -32700, "JSONを解析できません"); }
  const id = body.id ?? null;
  if (body.method === "initialize") return jsonRpc(id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "research-desk", version: "0.2.0" } });
  if (body.method === "notifications/initialized") return new NextResponse(null, { status: 202 });
  if (body.method === "tools/list") return jsonRpc(id, { tools: [TOOL] });
  if (body.method !== "tools/call") return jsonRpcError(id, -32601, "対応していないメソッドです");
  if (body.params?.name !== TOOL_NAME) return jsonRpcError(id, -32602, "指定されたツールは存在しません");
  try {
    const result = await importWeeklyReport(validateInput(body.params.arguments));
    return jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: result.status === "FAILED" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "週報の登録に失敗しました";
    return jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ code: "INVALID_REQUEST", message }) }], isError: true });
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  return NextResponse.json({ name: "research-desk", tools: [TOOL] });
}
