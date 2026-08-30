#!/usr/bin/env node
// CI（スクリーンショット撮影・動作確認）向けのダミーデータ投入。共有ワークフローが
// `db:seed:ci` という名前でこのスクリプトを呼ぶ契約になっている（名前が違うと無言で
// スキップされる。guchi-apps/docs の guides/new-app-checklist.md）。
import { PrismaClient } from "@prisma/client";

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

const DUMMY_INDUSTRY_ITEMS = [
  {
    business: "DELIVERY",
    informationType: "新商品",
    title: "サンプル: 戸建て向け宅配ボックスの新商品",
    url: "https://example.com/industry/delivery-sample",
    normalizedUrl: "https://example.com/industry/delivery-sample",
    sourceName: "サンプル一次情報",
    publisher: "サンプルメーカー",
    publishedAt: new Date("2026-08-25T00:00:00.000Z"),
    importance: "MEDIUM",
    tags: ["宅配", "新商品"],
    subjects: ["宅配ボックス"],
  },
  {
    business: "LOCKER",
    informationType: "導入事例・採用",
    title: "サンプル: 駅への宅配ロッカー導入事例",
    url: "https://example.com/industry/locker-sample",
    normalizedUrl: "https://example.com/industry/locker-sample",
    sourceName: "サンプル一次情報",
    publisher: "サンプル運営会社",
    publishedAt: new Date("2026-08-26T00:00:00.000Z"),
    importance: "HIGH",
    tags: ["ロッカー", "導入・提携"],
    subjects: ["PUDO"],
  },
];

async function main() {
  for (const clip of DUMMY_CLIPS) {
    await prisma.clip.create({ data: clip });
  }
  for (const item of DUMMY_INDUSTRY_ITEMS) {
    await prisma.industryItem.create({ data: item });
  }
  console.log(`Seeded ${DUMMY_CLIPS.length} clip(s) and ${DUMMY_INDUSTRY_ITEMS.length} industry item(s) for CI.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
