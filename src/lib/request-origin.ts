/**
 * リクエストの公開オリジン（例: `https://research-desk.gucchii.com`）を返す。
 *
 * Next.js 16の `request.url` は**待受アドレス**（`http://localhost:<PORT>`）を返し、
 * ブラウザが送った `Host` ヘッダーを反映しない。Apacheのリバースプロキシ配下にある本番で
 * `new URL(request.url).origin` を使うと `https://localhost:3115` になり、Supabaseへ渡す
 * OAuthの `redirect_to` が実在しないURLになる（#14）。
 *
 * 本番のApacheは `ProxyPreserveHost On` で `Host` を保持し、`X-Forwarded-Proto` を付ける
 * （`guchi-apps/vps` の `apache/sites-available/research-desk.gucchii.com.conf`）ため、
 * この2つからoriginを組み立てる。car-care・db-consoleと同じ形。
 */
export function getRequestOrigin(request: Request): string {
  const host = request.headers.get("host");
  if (!host) {
    return new URL(request.url).origin;
  }

  // プロキシを複数経由すると `https, http` のようにカンマ区切りで積まれる。最初の値が
  // ブラウザに一番近い。
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  return `${proto || "http"}://${host}`;
}

/**
 * ログイン後の戻り先として安全に使えるパスだけを通す（オープンリダイレクト対策）。
 *
 * `//evil.example` や `/\evil.example` はブラウザに別オリジンのURLとして解釈されるため、
 * 先頭が `/` であることだけでは足りない。
 */
export function safeNextPath(value: string | null, fallback = "/"): string {
  if (!value || !value.startsWith("/")) {
    return fallback;
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
