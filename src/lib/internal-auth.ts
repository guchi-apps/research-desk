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

function requireBearerSecret(request: Request, expected: string | undefined, notConfiguredError: string): NextResponse | null {
  // 未設定を「素通り」にはしない。設定漏れがそのまま認証なしの公開に化けるのを防ぐ。
  if (!expected) {
    return json({ error: notConfiguredError }, 503);
  }

  const header = request.headers.get("authorization");
  const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!presented || !isEqualConstantTime(presented, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  return null;
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
