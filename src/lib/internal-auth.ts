import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * サーバー間連携API（`/api/internal/*`）の認証。
 *
 * 呼び出し元は同一VPS上のAIDE（`127.0.0.1`）だけを想定しており、共有シークレット1本で守る。
 * ブラウザからの利用が無いためSupabaseのセッションは見ない（`src/proxy.ts`のmatcherは
 * `/dashboard`配下だけで、このパスは素通しする）。フリート内の他アプリ（dayspan・myroom・
 * subscription-lists・ops-dashboard）と同じく、環境変数名は`INTERNAL_API_KEY`で揃える。
 *
 * 通過した場合は null を返す。呼び出し側が「返り値があればそのまま返す」だけで済む形にする。
 */
export function requireInternalApiKey(request: Request): NextResponse | null {
  return requireBearerSecret(request, process.env.INTERNAL_API_KEY, "internal_api_not_configured");
}

/**
 * 記事AI解析のポーラー（`/api/internal/analysis/*`）の認証（#79・#86）。
 *
 * AIDEと**別のシークレット**にしてある。#86でポーラーがVPSへ移り、AIDEと同じく同一VPS内
 * （127.0.0.1）からの呼び出しになったが、呼び出し元は別の主体のままで、片方を無効化しても
 * もう片方が止まらないようにするため（issue-deckも`DISPATCH_SECRET`を進捗報告用と分けている）。
 */
export function requireAnalysisWorkerSecret(request: Request): NextResponse | null {
  return requireBearerSecret(request, process.env.ANALYSIS_WORKER_SECRET, "analysis_worker_not_configured");
}

/**
 * iPhoneのショートカットが写真を送る`POST /api/share/inbox`の認証（#144）。
 *
 * ショートカットはSupabaseのセッションを持てないため、スマホに置く専用のトークンで守る。
 * スマホに置く値なので、AIDE・ポーラー用のシークレットとは分けて、これだけを失効できるようにする。
 */
export function requireShareShortcutToken(request: Request): NextResponse | null {
  return requireBearerSecret(request, process.env.SHARE_SHORTCUT_TOKEN, "share_shortcut_not_configured");
}

/**
 * 日次収集（`POST /api/collection/daily`）を定期実行から呼ぶときのシークレット照合（#173）。
 *
 * このAPIはログイン済みの本人も呼べるため、他と違って「不一致ならその場で401」ではなく、
 * 真偽だけを返して呼び出し側がセッション認証へ続けられるようにする。未設定なら常にfalse
 * （素通りにはしない）。ヘッダーは`Authorization: Bearer`だけを受ける。
 */
export function hasCollectionCronSecret(request: Request): boolean {
  const expected = process.env.COLLECTION_CRON_SECRET;
  if (!expected) return false;
  const presented = readBearerToken(request);
  return presented !== null && isEqualConstantTime(presented, expected);
}

function requireBearerSecret(request: Request, expected: string | undefined, notConfiguredError: string): NextResponse | null {
  // 未設定を「素通り」にはしない。設定漏れがそのまま認証なしの公開に化けるのを防ぐ。
  if (!expected) {
    return json({ error: notConfiguredError }, 503);
  }

  const presented = readBearerToken(request);
  if (!presented || !isEqualConstantTime(presented, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  return null;
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

/** 認証結果も内容も、その時点の値だけが意味を持つ。経路上に残さない。 */
export function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** 文字列を定数時間で比較する（長さが違うと timingSafeEqual が例外を投げるため先に弾く）。 */
function isEqualConstantTime(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
