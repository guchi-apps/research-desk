import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * CI・ローカル開発専用のログインバイパス（GUIの無いホストから認証の背後にある画面へ入るための導線）。
 * 本番では常に無効にする（guchi-apps/docs の standards/dev-environment.md「ログインの背後にある画面は、
 * 開発用ログイン導線から入る」）。
 */
export const DEV_LOGIN_COOKIE_NAME = "ci_login_bypass";
const BYPASS_EMAIL = "ci-bypass@research-desk.local";

export function isDevLoginBypassEnabled(): boolean {
  // NODE_ENV==="production"なら常に無効。専用シークレットが未設定でも無効にする。
  return process.env.NODE_ENV !== "production" && Boolean(process.env.CI_LOGIN_BYPASS_SECRET);
}

function sign(secret: string): string {
  return createHmac("sha256", secret).update(BYPASS_EMAIL).digest("hex");
}

export function devLoginCookieValue(): string | null {
  const secret = process.env.CI_LOGIN_BYPASS_SECRET;
  if (!isDevLoginBypassEnabled() || !secret) return null;
  return sign(secret);
}

export function verifyDevLoginCookieValue(cookieValue: string | undefined | null): string | null {
  const secret = process.env.CI_LOGIN_BYPASS_SECRET;
  if (!isDevLoginBypassEnabled() || !secret || !cookieValue) return null;

  const expected = Buffer.from(sign(secret));
  const actual = Buffer.from(cookieValue);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  return BYPASS_EMAIL;
}
