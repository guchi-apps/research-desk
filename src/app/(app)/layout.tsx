import AppShell from "@/components/AppShell";

// サイドバーをここへ集約する。実体は`AppShell`（クライアント側）だが、`children`はpropsとして
// 渡すだけなので配下のpage.tsxはサーバーコンポーネントのまま描画され、遷移時にサイドバーが
// 再マウントされることもない（#73。以前は各page.tsxがサイドバーごと`app-shell`全体を描画して
// いたため、遷移のたびにルートの`loading.tsx`がサイドバーごと全画面スプラッシュへ置き換えていた）。
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
