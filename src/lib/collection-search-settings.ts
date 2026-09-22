import { prisma } from "@/lib/db";

export const DEFAULT_COLLECTION_SEARCH_POLICY = "宅配ボックス・機能門柱・マルチロッカーについて、商品企画、市場、導入、制度、安全性に役立つ一次情報を優先する。話題の背景に出るだけの記事、人事・芸能・スポーツなど事業と直接関係しない記事は採用しない。";
const INSTRUCTION_LIMIT = 1000;

export type CollectionSearchPolicyView = { policy: string; pendingInstruction: string | null; updatedAt: Date };

export async function getCollectionSearchPolicy(): Promise<CollectionSearchPolicyView> {
  const value = await prisma.collectionSearchPolicy.upsert({
    where: { id: 1 }, create: { id: 1, policy: DEFAULT_COLLECTION_SEARCH_POLICY }, update: {},
  });
  return value;
}

export async function requestCollectionSearchPolicyAdjustment(instruction: string): Promise<CollectionSearchPolicyView | null> {
  const text = instruction.trim().slice(0, INSTRUCTION_LIMIT);
  if (!text) return null;
  return prisma.collectionSearchPolicy.upsert({
    where: { id: 1 }, create: { id: 1, policy: DEFAULT_COLLECTION_SEARCH_POLICY, pendingInstruction: text }, update: { pendingInstruction: text },
  });
}

export async function saveCollectionSearchPolicy(policy: string): Promise<void> {
  const text = policy.trim().slice(0, 4000) || DEFAULT_COLLECTION_SEARCH_POLICY;
  await prisma.collectionSearchPolicy.upsert({ where: { id: 1 }, create: { id: 1, policy: text }, update: { policy: text, pendingInstruction: null } });
}
