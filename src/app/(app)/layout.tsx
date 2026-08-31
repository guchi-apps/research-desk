import SidebarNav from "@/components/SidebarNav";

// サイドバーをここへ集約する。同期的（awaitなし）なコンポーネントなので遷移時にSuspenseへ
// 引っかからず、配下のpage.tsxが持つ非同期処理の間もサイドバーは再マウントされない
// （#73。以前は各page.tsxがサイドバーごと`app-shell`全体を描画していたため、遷移のたびに
// ルートの`loading.tsx`がサイドバーごと全画面スプラッシュへ置き換えていた）。
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          research<span>·</span>desk
        </div>
        <SidebarNav />
      </aside>
      {children}
    </main>
  );
}
