import type { Prisma } from "@prisma/client";
import type { IndustryInformationListItem } from "@/lib/industry-information";
import type { NewsMailArticleDto, NewsMailMetric } from "@/lib/news-mail";

/**
 * DBの記事を、週報メール（#110）が扱う形へ移す。
 *
 * `src/lib/news-mail.ts`はPrismaに触れない純粋なモジュール（単体テストとブラウザから読むため）
 * なので、Prismaの型に依存する変換だけをここへ分けている。
 *
 * **要約・示唆・主な数値はAI解析の結果を優先する。** 解析が済んでいない記事は登録時の値を
 * 使い、`analyzed: false`にしてメール本文でもその旨が分かるようにする。
 */

/** `extractedMetrics`（登録時のJSON）・`metrics`（解析結果のJSON）を`{ name, value }`の配列にする。 */
function toMetrics(value: Prisma.JsonValue | null | undefined): NewsMailMetric[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => (item === null || typeof item === "object" ? [] : [{ name: `項目${index + 1}`, value: String(item) }]));
  }
  if (typeof value !== "object") return [];
  return Object.entries(value).flatMap(([name, item]) => (item === null || item === undefined || typeof item === "object" ? [] : [{ name, value: String(item) }]));
}

export function toNewsMailArticleDto(item: IndustryInformationListItem): NewsMailArticleDto {
  const analysis = item.analyses[0] ?? null;
  const analyzed = item.analysisStatus === "COMPLETED" && analysis !== null;
  return {
    id: item.id,
    title: item.title,
    originalUrl: item.originalUrl,
    sourceName: item.sourceName,
    business: item.business,
    isPrimarySource: item.isPrimarySource,
    importance: item.importance,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    occurredAt: item.occurredAt?.toISOString() ?? null,
    collectedAt: item.collectedAt.toISOString(),
    summary: (analyzed ? analysis.summary : null) ?? item.summary,
    implications: (analyzed ? analysis.implications : null) ?? item.implications,
    metrics: toMetrics(analyzed ? analysis.metrics : item.extractedMetrics),
    analyzed,
  };
}
