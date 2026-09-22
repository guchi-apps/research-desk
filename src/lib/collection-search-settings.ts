import { prisma } from "@/lib/db";

export type CollectionSearchBusiness = "DELIVERY" | "LOCKER";

export const DEFAULT_COLLECTION_SEARCH_POLICY: Record<CollectionSearchBusiness, string> = {
  DELIVERY: "宅配ボックス・機能門柱について、商品企画、市場、導入、制度、安全性に役立つ一次情報を優先する。話題の背景に出るだけの記事、人事・芸能・スポーツなど事業と直接関係しない記事は採用しない。",
  LOCKER: "マルチロッカーについて、商品企画、市場、導入、制度、安全性に役立つ一次情報を優先する。話題の背景に出るだけの記事、人事・芸能・スポーツなど事業と直接関係しない記事は採用しない。",
};
const INSTRUCTION_LIMIT = 1000;

export type CollectionSearchPolicyView = { business: CollectionSearchBusiness; policy: string; pendingInstruction: string | null; updatedAt: Date };

export async function getCollectionSearchPolicy(business: CollectionSearchBusiness): Promise<CollectionSearchPolicyView> {
  return prisma.collectionSearchPolicy.upsert({
    where: { business }, create: { business, policy: DEFAULT_COLLECTION_SEARCH_POLICY[business] }, update: {},
  });
}

export async function getCollectionSearchPolicies(): Promise<Record<CollectionSearchBusiness, CollectionSearchPolicyView>> {
  const [delivery, locker] = await Promise.all([getCollectionSearchPolicy("DELIVERY"), getCollectionSearchPolicy("LOCKER")]);
  return { DELIVERY: delivery, LOCKER: locker };
}

export async function requestCollectionSearchPolicyAdjustment(business: CollectionSearchBusiness, instruction: string): Promise<CollectionSearchPolicyView | null> {
  const text = instruction.trim().slice(0, INSTRUCTION_LIMIT);
  if (!text) return null;
  return prisma.collectionSearchPolicy.upsert({
    where: { business }, create: { business, policy: DEFAULT_COLLECTION_SEARCH_POLICY[business], pendingInstruction: text }, update: { pendingInstruction: text },
  });
}

export async function saveCollectionSearchPolicy(business: CollectionSearchBusiness, policy: string): Promise<void> {
  const text = policy.trim().slice(0, 4000) || DEFAULT_COLLECTION_SEARCH_POLICY[business];
  await prisma.collectionSearchPolicy.upsert({ where: { business }, create: { business, policy: text }, update: { policy: text, pendingInstruction: null } });
}
