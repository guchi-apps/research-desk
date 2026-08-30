#!/usr/bin/env node
// CI（スクリーンショット撮影・動作確認）向けのダミーデータ投入。共有ワークフローが
// `db:seed:ci` という名前でこのスクリプトを呼ぶ契約になっている（名前が違うと無言で
// スキップされる。guchi-apps/docs の guides/new-app-checklist.md）。
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

const DUMMY_CLIPS = [
  {
    title: "サンプルクリップ: リサーチメモの書き方",
    url: "https://example.com/articles/research-memo",
    content: "リサーチメモを構造化して残すコツについてのメモ。",
    source: "example.com",
  },
  {
    title: "サンプルクリップ: AI要約ツールの比較",
    url: "https://example.com/articles/ai-summary-tools",
    content: "Claude／ChatGPTでの要約結果を比較したメモ。",
    source: "example.com",
  },
];

const DUMMY_INDUSTRY_INFORMATION = [
  {
    business: "DELIVERY",
    informationType: "NEW_PRODUCT",
    title: "戸建て向け宅配ボックスの新商品発表（サンプル）",
    originalUrl: "https://example.com/delivery/new-product",
    sourceName: "example.com",
    publisher: "サンプル住宅設備株式会社",
    isPrimarySource: true,
    publishedAt: new Date("2026-08-20T00:00:00Z"),
    content: "戸建て向け宅配ボックスの新商品に関する一次情報のサンプル。",
    summary: "設置性と受け取り容量を改善した新商品。",
    extractedMetrics: { capacity: "120L", installationTimeMinutes: 90 },
    implications: "郵便ポスト一体型商品の企画で、施工時間の短縮を評価軸にする。",
    importance: "HIGH",
    targetCompany: "サンプル住宅設備株式会社",
    targetProduct: "戸建て向け宅配ボックス",
    keywords: ["宅配ボックス", "戸建て", "新商品"],
    tags: ["宅配事業", "商品企画"],
    periodScope: "IN_SCOPE",
  },
  {
    business: "LOCKER",
    informationType: "INTRODUCTION_CASE",
    title: "コンビニ向けセルフ発送機の導入事例（サンプル）",
    originalUrl: "https://example.com/locker/introduction-case",
    sourceName: "example.com",
    publisher: "サンプル物流サービス株式会社",
    isPrimarySource: false,
    publishedAt: new Date("2026-08-18T00:00:00Z"),
    occurredAt: new Date("2026-08-15T00:00:00Z"),
    content: "コンビニ店舗にセルフ発送機を導入した事例のサンプル。",
    summary: "店舗スタッフの受付負担を減らし、発送拠点を拡大した。",
    extractedMetrics: { installedStores: 250 },
    implications: "ロッカー事業では設置拠点の運用負担と利用導線を比較する。",
    importance: "MEDIUM",
    targetCompany: "サンプル物流サービス株式会社",
    targetProduct: "セルフ発送機",
    keywords: ["ロッカー", "セルフ発送", "導入事例"],
    tags: ["ロッカー事業", "競合調査"],
    periodScope: "PAST_30_DAYS_SUPPLEMENT",
  },
];

function normalizeUrl(url) {
  const normalized = new URL(url);
  normalized.hash = "";
  normalized.pathname = normalized.pathname.replace(/\/$/, "") || "/";
  return normalized.toString();
}

function withUrlIdentity(item) {
  const normalizedUrl = normalizeUrl(item.originalUrl);
  return {
    ...item,
    normalizedUrl,
    urlHash: createHash("sha256").update(normalizedUrl).digest("hex"),
  };
}

async function main() {
  for (const clip of DUMMY_CLIPS) {
    await prisma.clip.create({ data: clip });
  }
  for (const information of DUMMY_INDUSTRY_INFORMATION) {
    await prisma.industryInformation.create({ data: withUrlIdentity(information) });
  }
  console.log(`Seeded ${DUMMY_CLIPS.length} clip(s) and ${DUMMY_INDUSTRY_INFORMATION.length} industry information record(s) for CI.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
