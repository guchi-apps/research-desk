// SupabaseへのリクエストがSDK内部で失敗すると、getUser()は未ログインと同じ user: null を返す。
// 通信不達（AuthRetryableFetchError）とレート制限（429）は「今は確認できない」として区別しないと、
// 電波の悪い場所で開いただけの利用者がログイン画面へ差し戻される
// （guchi-apps/docs の knowledge/supabase.md）。isAuthRetryableFetchErrorは@supabase/supabase-jsから
// 再公開されていないため、判定を自前で持つ。
// proxy.ts（Edge相当）とauth.ts（サーバーコンポーネント）の両方から使うため、Next.jsにもSDKにも
// 依存しない純粋な関数としてここへ置く。
export function isRetryableAuthError(error: { name?: string; status?: number } | null): boolean {
  if (!error) return false;
  return error.name === "AuthRetryableFetchError" || error.status === 429;
}
