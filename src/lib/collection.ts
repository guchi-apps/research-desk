import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const COLLECTION_LIMIT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
type Business = "DELIVERY" | "LOCKER";
type InformationType = "NEW_PRODUCT" | "COMPETITOR" | "INTRODUCTION_CASE" | "POLICY_SUBSIDY" | "MARKET_STATISTICS" | "USER_ISSUE" | "QUALITY_SAFETY" | "OVERSEAS_CASE" | "OTHER";
type Candidate = { business: Business; title: string; url: string; sourceName: string; publisher: string | null; publishedAt: Date; isSupplemental: boolean; informationType: InformationType; importance: "HIGH" | "MEDIUM" | "REFERENCE"; keywords: string[]; tags: string[] };
type InformationTypeValue = "NEW_PRODUCT" | "COMPETITOR" | "INTRODUCTION_CASE" | "RECRUITMENT_PARTNERSHIP" | "POLICY_SUBSIDY" | "MARKET_STATISTICS" | "USER_ISSUE" | "CONSTRUCTION" | "QUALITY_SAFETY" | "PATENT" | "OVERSEAS_CASE" | "OTHER";
type ImportanceValue = "HIGH" | "MEDIUM" | "REFERENCE";

export type CollectionResult = { runId: string; status: "SUCCEEDED" | "PARTIAL" | "FAILED"; targetFrom: string; targetTo: string; supplementalFrom: string; fetchedCount: number; selectedCount: number; insertedCount: number; duplicateCount: number; failedCount: number; errors: string[] };

const FEEDS = [
  { business: "DELIVERY" as const, name: "宅配・住宅設備の公開情報", url: "https://news.google.com/rss/search?q=" + encodeURIComponent("(宅配ボックス OR ポスト OR 機能門柱 OR 置き配) (新商品 OR 発表 OR 導入 OR 補助金)") + "&hl=ja&gl=JP&ceid=JP:ja" },
  { business: "LOCKER" as const, name: "ロッカー・発送サービスの公開情報", url: "https://news.google.com/rss/search?q=" + encodeURIComponent("(PUDO OR SMARI OR Amazon Hub OR マルチエキューブ OR SPACER OR セルフ発送) (導入 OR 発表 OR 物流 OR 返品)") + "&hl=ja&gl=JP&ceid=JP:ja" },
  { business: "LOCKER" as const, name: "海外ロッカー事例", url: "https://news.google.com/rss/search?q=" + encodeURIComponent("(parcel locker OR locker drop-off OR self-service shipping kiosk)") + "&hl=en&gl=US&ceid=US:en" },
];

function field(item: string, name: string): string | null {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match?.[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() ?? null;
}

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value); url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, "");
  } catch { return value.trim().replace(/\/$/, ""); }
}

export type WeeklyReportArticle = {
  business: Business;
  informationType: InformationTypeValue;
  title: string;
  url: string;
  sourceName: string;
  publisher?: string | null;
  isPrimarySource?: boolean;
  publishedAt?: string | null;
  occurredAt?: string | null;
  content?: string | null;
  summary?: string | null;
  extractedMetrics?: Prisma.InputJsonValue | null;
  implications?: string | null;
  importance?: ImportanceValue;
  targetCompany?: string | null;
  targetProduct?: string | null;
  keywords?: string[];
  tags?: string[];
  periodScope?: "IN_SCOPE" | "PAST_30_DAYS_SUPPLEMENT";
};

export type WeeklyReportInput = {
  executedAt: string;
  targetFrom: string;
  targetTo: string;
  articles: WeeklyReportArticle[];
};

export type WeeklyReportImportResult = CollectionResult & {
  businessCounts: { DELIVERY: number; LOCKER: number };
  duplicateBusinessCounts: { DELIVERY: number; LOCKER: number };
};

function parseDate(value: string | null | undefined, fieldName: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldName}は有効なISO 8601日時で指定してください`);
  return date;
}

export async function importWeeklyReport(input: WeeklyReportInput): Promise<WeeklyReportImportResult> {
  const targetFrom = parseDate(input.targetFrom, "targetFrom");
  const targetTo = parseDate(input.targetTo, "targetTo");
  if (!targetFrom || !targetTo || targetFrom > targetTo) throw new Error("対象期間が不正です");
  const executedAt = parseDate(input.executedAt, "executedAt");
  if (!executedAt) throw new Error("executedAtは必須です");
  const supplementalFrom = new Date(targetTo.getTime() - 30 * DAY_MS);
  const run = await prisma.collectionRun.create({ data: { startedAt: executedAt, targetFrom, targetTo, supplementalFrom } });
  const errors: string[] = [];
  let insertedCount = 0;
  let duplicateCount = 0;
  const businessCounts = { DELIVERY: 0, LOCKER: 0 };
  const duplicateBusinessCounts = { DELIVERY: 0, LOCKER: 0 };
  const seen = new Set<string>();

  for (const [index, article] of input.articles.entries()) {
    const normalizedUrl = normalizeUrl(article.url);
    if (seen.has(normalizedUrl)) {
      duplicateCount++;
      duplicateBusinessCounts[article.business]++;
      continue;
    }
    seen.add(normalizedUrl);
    try {
      const existing = await prisma.industryInformation.findUnique({ where: { normalizedUrl }, select: { id: true } });
      if (existing) {
        duplicateCount++;
        duplicateBusinessCounts[article.business]++;
        continue;
      }
      await prisma.industryInformation.create({ data: {
        business: article.business,
        informationType: article.informationType,
        title: article.title,
        originalUrl: article.url,
        normalizedUrl,
        urlHash: createHash("sha256").update(normalizedUrl).digest("hex"),
        sourceName: article.sourceName,
        publisher: article.publisher ?? null,
        isPrimarySource: article.isPrimarySource ?? false,
        publishedAt: parseDate(article.publishedAt, `articles[${index}].publishedAt`),
        occurredAt: parseDate(article.occurredAt, `articles[${index}].occurredAt`),
        content: article.content ?? null,
        summary: article.summary ?? null,
        extractedMetrics: article.extractedMetrics ?? undefined,
        implications: article.implications ?? null,
        importance: article.importance ?? "REFERENCE",
        targetCompany: article.targetCompany ?? null,
        targetProduct: article.targetProduct ?? null,
        keywords: article.keywords ?? [],
        tags: article.tags ?? [],
        periodScope: article.periodScope ?? "IN_SCOPE",
        collectionRunId: run.id,
      } });
      insertedCount++;
      businessCounts[article.business]++;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        duplicateCount++;
        duplicateBusinessCounts[article.business]++;
      } else {
        errors.push(`ARTICLE_INSERT_FAILED: 記事${index + 1}件目の登録に失敗しました`);
      }
    }
  }
  const status = errors.length > 0 ? (insertedCount > 0 ? "PARTIAL" : "FAILED") : "SUCCEEDED";
  const result = { runId: run.id, status, targetFrom: targetFrom.toISOString(), targetTo: targetTo.toISOString(), supplementalFrom: supplementalFrom.toISOString(), fetchedCount: input.articles.length, selectedCount: input.articles.length, insertedCount, duplicateCount, failedCount: errors.length, errors, businessCounts, duplicateBusinessCounts } as WeeklyReportImportResult;
  await prisma.collectionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), status, fetchedCount: result.fetchedCount, selectedCount: result.selectedCount, insertedCount, duplicateCount, failedCount: errors.length, errors } });
  return result;
}

function similarTitle(left: string, right: string): boolean {
  const words = (value: string) => new Set(value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1));
  const leftWords = words(left); const rightWords = words(right);
  if (!leftWords.size || !rightWords.size) return left === right;
  return [...leftWords].filter((word) => rightWords.has(word)).length / Math.min(leftWords.size, rightWords.size) >= 0.8;
}

function classify(title: string, business: Business): Pick<Candidate, "informationType" | "importance" | "keywords" | "tags"> {
  const text = title.toLowerCase(); const tags = [business === "DELIVERY" ? "宅配事業" : "ロッカー事業"];
  if (/新商品|発売|新製品|発表/.test(text)) tags.push("新商品");
  if (/導入|採用|提携|設置/.test(text)) tags.push("導入事例");
  if (/補助金|制度|行政/.test(text)) tags.push("制度・補助金");
  const informationType: InformationType = /導入|採用|設置|提携/.test(text) ? "INTRODUCTION_CASE" : /補助金|制度|行政/.test(text) ? "POLICY_SUBSIDY" : /市場|統計|調査/.test(text) ? "MARKET_STATISTICS" : /レビュー|課題|トラブル/.test(text) ? "USER_ISSUE" : /新商品|発売|新製品/.test(text) ? "NEW_PRODUCT" : /parcel locker|locker|pudo|smari/i.test(text) ? "OVERSEAS_CASE" : "COMPETITOR";
  const importance = /発表|導入|採用|提携|補助金/.test(text) ? "HIGH" : /新商品|発売|市場|統計/.test(text) ? "MEDIUM" : "REFERENCE";
  const subjects = ["LIXIL", "YKK AP", "ナスタ", "三協アルミ", "ユニソン", "パナソニック", "PUDO", "SMARI", "Amazon Hub", "SPACER", "マルチエキューブ"];
  return { informationType, importance, keywords: subjects.filter((subject) => title.includes(subject)), tags };
}

function parseFeed(xml: string, feed: (typeof FEEDS)[number], targetFrom: Date, targetTo: Date, supplementalFrom: Date): Candidate[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1]).map((item) => {
    const title = field(item, "title"); const url = field(item, "link"); const dateText = field(item, "pubDate"); const publishedAt = dateText ? new Date(dateText) : null;
    if (!title || !url || !publishedAt || Number.isNaN(publishedAt.getTime()) || publishedAt < supplementalFrom || publishedAt > targetTo) return null;
    return { business: feed.business, title, url: normalizeUrl(url), sourceName: feed.name, publisher: field(item, "source"), publishedAt, isSupplemental: publishedAt < targetFrom, ...classify(title, feed.business) };
  }).filter((item): item is Candidate => item !== null);
}

function selectCandidates(candidates: Candidate[]): Candidate[] {
  const selected: Candidate[] = [];
  for (const candidate of candidates.sort((a, b) => Number(a.isSupplemental) - Number(b.isSupplemental) || b.publishedAt.getTime() - a.publishedAt.getTime())) {
    if (selected.length >= COLLECTION_LIMIT || selected.some((item) => item.url === candidate.url || similarTitle(item.title, candidate.title))) continue;
    if (selected.filter((item) => item.business === candidate.business).length >= 3) continue;
    selected.push(candidate);
  }
  return selected;
}

function toIndustryInformation(item: Candidate, collectionRunId: string, canonicalId?: string) {
  const normalizedUrl = item.url;
  const data: Prisma.IndustryInformationUncheckedCreateInput = { business: item.business, informationType: item.informationType, title: item.title, originalUrl: item.url, normalizedUrl, urlHash: createHash("sha256").update(normalizedUrl).digest("hex"), sourceName: item.sourceName, publisher: item.publisher, isPrimarySource: false, publishedAt: item.publishedAt, importance: item.importance, keywords: item.keywords, tags: item.tags, periodScope: item.isSupplemental ? "PAST_30_DAYS_SUPPLEMENT" : "IN_SCOPE", collectionRunId };
  return canonicalId ? { ...data, canonicalId } : data;
}

export async function runWeeklyCollection(now = new Date()): Promise<CollectionResult> {
  const targetTo = new Date(now); const targetFrom = new Date(now.getTime() - 7 * DAY_MS); const supplementalFrom = new Date(now.getTime() - 30 * DAY_MS);
  const run = await prisma.collectionRun.create({ data: { targetFrom, targetTo, supplementalFrom } }); const errors: string[] = []; const candidates: Candidate[] = [];
  for (const feed of FEEDS) try {
    const response = await fetch(feed.url, { headers: { "user-agent": "research-desk/0.1 (+public-rss-collector)" }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    candidates.push(...parseFeed(await response.text(), feed, targetFrom, targetTo, supplementalFrom));
  } catch (error) { errors.push(`${feed.name}: ${error instanceof Error ? error.message : "取得に失敗しました"}`); }
  const selected = selectCandidates(candidates); let insertedCount = 0; let duplicateCount = 0;
  const existing = await prisma.industryInformation.findMany({ where: { publishedAt: { gte: supplementalFrom } }, select: { id: true, business: true, title: true, normalizedUrl: true, canonicalId: true } });
  for (const item of selected) {
    if (existing.some((record) => record.normalizedUrl === item.url)) { duplicateCount++; continue; }
    const canonical = existing.find((record) => record.business === item.business && similarTitle(record.title, item.title));
    await prisma.industryInformation.create({ data: toIndustryInformation(item, run.id, canonical?.canonicalId ?? canonical?.id) }); insertedCount++;
  }
  const status = errors.length === FEEDS.length ? "FAILED" : errors.length > 0 ? "PARTIAL" : "SUCCEEDED";
  await prisma.collectionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), status, fetchedCount: candidates.length, selectedCount: selected.length, insertedCount, duplicateCount, failedCount: errors.length, errors } });
  return { runId: run.id, status, targetFrom: targetFrom.toISOString(), targetTo: targetTo.toISOString(), supplementalFrom: supplementalFrom.toISOString(), fetchedCount: candidates.length, selectedCount: selected.length, insertedCount, duplicateCount, failedCount: errors.length, errors };
}
