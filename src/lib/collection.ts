import { prisma } from "@/lib/db";

export const COLLECTION_LIMIT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

type Business = "DELIVERY" | "LOCKER";

type Feed = {
  business: Business;
  name: string;
  url: string;
};

type Candidate = {
  business: Business;
  title: string;
  url: string;
  sourceName: string;
  publisher: string | null;
  publishedAt: Date;
  isSupplemental: boolean;
  informationType: string;
  importance: "HIGH" | "MEDIUM" | "REFERENCE";
  tags: string[];
  subjects: string[];
};

export type CollectionResult = {
  runId: string;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED";
  targetFrom: string;
  targetTo: string;
  supplementalFrom: string | null;
  fetchedCount: number;
  selectedCount: number;
  insertedCount: number;
  duplicateCount: number;
  failedCount: number;
  errors: string[];
};

const FEEDS: Feed[] = [
  {
    business: "DELIVERY",
    name: "宅配・住宅設備の公開情報",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("(宅配ボックス OR ポスト OR 機能門柱 OR 置き配) (新商品 OR 発表 OR 導入 OR 補助金)") + "&hl=ja&gl=JP&ceid=JP:ja",
  },
  {
    business: "LOCKER",
    name: "ロッカー・発送サービスの公開情報",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("(PUDO OR SMARI OR Amazon Hub OR マルチエキューブ OR SPACER OR セルフ発送) (導入 OR 発表 OR 物流 OR 返品)") + "&hl=ja&gl=JP&ceid=JP:ja",
  },
  {
    business: "LOCKER",
    name: "海外ロッカー事例",
    url: "https://news.google.com/rss/search?q=" + encodeURIComponent("(parcel locker OR locker drop-off OR self-service shipping kiosk)") + "&hl=en&gl=US&ceid=US:en",
  },
];

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function field(item: string, name: string): string | null {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

function titleKey(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 80);
}

function isSimilarTitle(left: string, right: string): boolean {
  const leftWords = new Set(left.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1));
  const rightWords = new Set(right.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1));
  if (!leftWords.size || !rightWords.size) return titleKey(left) === titleKey(right);
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  return intersection / Math.min(leftWords.size, rightWords.size) >= 0.8;
}

function classify(title: string, business: Business): Pick<Candidate, "informationType" | "importance" | "tags" | "subjects"> {
  const text = title.toLowerCase();
  const tags = [business === "DELIVERY" ? "宅配" : "ロッカー"];
  if (/新商品|発売|新製品|発表/.test(text)) tags.push("新商品");
  if (/導入|採用|提携|設置/.test(text)) tags.push("導入・提携");
  if (/補助金|制度|行政|省/.test(text)) tags.push("制度・補助金");
  if (/安全|品質|事故|防犯/.test(text)) tags.push("品質・安全");
  const informationType = /導入|採用|設置|提携/.test(text) ? "導入事例・採用" : /補助金|制度|行政/.test(text) ? "制度・補助金" : /市場|統計|調査/.test(text) ? "市場統計" : /レビュー|課題|トラブル/.test(text) ? "利用者課題" : /新商品|発売|新製品/.test(text) ? "新商品" : "競合・業界動向";
  const importance = /発表|導入|採用|提携|補助金/.test(text) ? "HIGH" : /新商品|発売|市場|統計/.test(text) ? "MEDIUM" : "REFERENCE";
  const knownSubjects = ["LIXIL", "YKK AP", "ナスタ", "三協アルミ", "ユニソン", "パナソニック", "PUDO", "SMARI", "Amazon Hub", "SPACER", "マルチエキューブ"];
  return { informationType, importance, tags, subjects: knownSubjects.filter((subject) => title.includes(subject)) };
}

function parseFeed(xml: string, feed: Feed, targetFrom: Date, targetTo: Date, supplementalFrom: Date): Candidate[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map((match) => match[1])
    .map((item) => {
      const title = field(item, "title");
      const url = field(item, "link");
      const dateText = field(item, "pubDate");
      const publishedAt = dateText ? new Date(dateText) : null;
      if (!title || !url || !publishedAt || Number.isNaN(publishedAt.getTime())) return null;
      const inPrimaryWindow = publishedAt >= targetFrom && publishedAt <= targetTo;
      if (publishedAt < supplementalFrom || publishedAt > targetTo) return null;
      return { business: feed.business, title, url: normalizeUrl(url), sourceName: feed.name, publisher: field(item, "source"), publishedAt, isSupplemental: !inPrimaryWindow, ...classify(title, feed.business) };
    })
    .filter((item): item is Candidate => item !== null);
}

function selectCandidates(candidates: Candidate[]): Candidate[] {
  const byUrl = new Set<string>();
  const byTitle = new Set<string>();
  const selected: Candidate[] = [];
  for (const candidate of candidates.sort((a, b) => Number(a.isSupplemental) - Number(b.isSupplemental) || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))) {
    const key = titleKey(candidate.title);
    if (byUrl.has(candidate.url) || byTitle.has(key) || selected.some((item) => isSimilarTitle(item.title, candidate.title))) continue;
      const businessCount = selected.filter((item) => item.business === candidate.business).length;
      if (selected.length < COLLECTION_LIMIT && businessCount < 3) selected.push(candidate);
    byUrl.add(candidate.url);
    byTitle.add(key);
  }
  return selected;
}

export async function runWeeklyCollection(now = new Date()): Promise<CollectionResult> {
  const targetTo = new Date(now);
  const targetFrom = new Date(now.getTime() - 7 * DAY_MS);
  const supplementalFrom = new Date(now.getTime() - 30 * DAY_MS);
  const run = await prisma.collectionRun.create({ data: { targetFrom, targetTo, supplementalFrom } });
  const errors: string[] = [];
  const candidates: Candidate[] = [];

  for (const feed of FEEDS) {
    try {
      const response = await fetch(feed.url, { headers: { "user-agent": "research-desk/0.1 (+public-rss-collector)" }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      candidates.push(...parseFeed(await response.text(), feed, targetFrom, targetTo, supplementalFrom));
    } catch (error) {
      errors.push(`${feed.name}: ${error instanceof Error ? error.message : "取得に失敗しました"}`);
    }
  }

  const selected = selectCandidates(candidates);
  let insertedCount = 0;
  let duplicateCount = 0;
  const existingItems = await prisma.industryItem.findMany({ where: { publishedAt: { gte: supplementalFrom } }, select: { id: true, business: true, title: true, normalizedUrl: true, relatedUrls: true } });
  for (const item of selected) {
    const existing = await prisma.industryItem.findUnique({ where: { normalizedUrl: item.url }, select: { id: true } });
    if (existing) {
      const primary = existingItems.find((candidate) => candidate.id === existing.id);
      if (primary && !Array.isArray(primary.relatedUrls)) {
        await prisma.industryItem.update({ where: { id: primary.id }, data: { relatedUrls: [item.url] } });
      }
      duplicateCount++;
      continue;
    }
    const similar = existingItems.find((candidate) => candidate.business === item.business && isSimilarTitle(candidate.title, item.title));
    if (similar) {
      const relatedUrls = Array.isArray(similar.relatedUrls) ? similar.relatedUrls.filter((url): url is string => typeof url === "string") : [];
      if (!relatedUrls.includes(item.url)) relatedUrls.push(item.url);
      await prisma.industryItem.update({ where: { id: similar.id }, data: { relatedUrls } });
      duplicateCount++;
      continue;
    }
    await prisma.industryItem.create({ data: { ...item, normalizedUrl: item.url, metrics: undefined, tags: item.tags, subjects: item.subjects, relatedUrls: [] } });
    insertedCount++;
  }

  const status = errors.length === FEEDS.length ? "FAILED" : errors.length > 0 ? "PARTIAL" : "SUCCEEDED";
  await prisma.collectionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), status, fetchedCount: candidates.length, selectedCount: selected.length, insertedCount, duplicateCount, failedCount: errors.length, errors } });
  return { runId: run.id, status, targetFrom: targetFrom.toISOString(), targetTo: targetTo.toISOString(), supplementalFrom: supplementalFrom.toISOString(), fetchedCount: candidates.length, selectedCount: selected.length, insertedCount, duplicateCount, failedCount: errors.length, errors };
}
