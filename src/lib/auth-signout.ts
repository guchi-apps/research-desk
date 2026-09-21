// このアプリのセッションだけを破棄するログアウト。
// Supabase Authの`signOut()`は既定のscopeが`global`で、引数なしで呼ぶと共有Supabaseプロジェクトを
// 使う他アプリ・他端末のrefresh tokenまで失効させる（guchi-apps/issue-deck#3235）。
// `local`ならこのブラウザ（Cookie）のセッションだけが消える。
// scopeを明示する呼び出しをここに閉じ込め、テストで`local`が渡ることを確かめる
// （テストはPrismaやNext.jsをimportできないため、依存の無いこのファイルへ切り出している）。
type SignOutClient = {
  auth: {
    signOut: (options: { scope: "local" }) => Promise<unknown>;
  };
};

export async function signOutThisApp(supabase: SignOutClient): Promise<void> {
  await supabase.auth.signOut({ scope: "local" });
}
