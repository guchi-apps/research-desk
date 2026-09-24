import webpush from "web-push";
import { prisma } from "@/lib/db";
import {
  buildNewArticlesPayload,
  isSubscriptionGone,
  shouldNotifyNewArticles,
  type PushPayload,
  type PushSubscriptionInput,
} from "@/lib/push-rules";

/**
 * 新着記事のPush通知（#231）。VAPID鍵は環境変数（`VAPID_PUBLIC_KEY`・`VAPID_PRIVATE_KEY`・
 * `VAPID_SUBJECT`）で渡す。3つとも揃っていないときは機能ごと無効で、収集は通常どおり成功する。
 * **送れなくても例外を呼び出し側へ伝播させない**（`aide-bot-notice.ts`と同じ方針）。
 */

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function readVapidConfig(): VapidConfig | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (process.env.VAPID_SUBJECT ?? "").trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** 画面が購読に使う公開鍵。未設定ならnull（通知機能は無効表示になる） */
export function getVapidPublicKey(): string | null {
  return readVapidConfig()?.publicKey ?? null;
}

export async function savePushSubscription(input: PushSubscriptionInput, userAgent: string | null): Promise<void> {
  const ua = userAgent ? userAgent.slice(0, 255) : null;
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { ...input, userAgent: ua },
    update: { p256dh: input.p256dh, auth: input.auth, userAgent: ua },
  });
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export interface PushSendResult {
  sent: number;
  removed: number;
  failed: number;
}

/** 全購読へ送る。失効（404/410）した購読は消す。一時的な失敗は残して`failed`に数える */
export async function sendPushToAll(payload: PushPayload): Promise<PushSendResult> {
  const config = readVapidConfig();
  const result: PushSendResult = { sent: 0, removed: 0, failed: 0 };
  if (!config) return result;

  const subscriptions = await prisma.pushSubscription.findMany();
  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          body,
          {
            vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
            // 端末が圏外でも、翌朝までは届ける
            TTL: 60 * 60 * 12,
          },
        );
        result.sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: unknown }).statusCode;
        if (isSubscriptionGone(statusCode)) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: subscription.endpoint } });
          result.removed += 1;
        } else {
          // 購読情報（endpoint・鍵）はログへ出さない
          console.error(`Push通知の送信に失敗しました（HTTP ${String(statusCode ?? "unknown")}）`);
          result.failed += 1;
        }
      }
    }),
  );
  return result;
}

/** 日次収集の後に呼ぶ。新規記事が無い日は何もしない。例外は握って収集の成否に影響させない */
export async function notifyNewArticlesPush(insertedCount: number): Promise<void> {
  if (!shouldNotifyNewArticles(insertedCount)) return;
  try {
    await sendPushToAll(buildNewArticlesPayload(insertedCount));
  } catch (error) {
    console.error("Push通知の送信に失敗しました", error);
  }
}
