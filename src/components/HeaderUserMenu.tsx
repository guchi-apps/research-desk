import Link from "next/link";

// スマホ幅（767px以下）では`.user`（アバター＋ログアウト）を隠し、`.settings-btn`だけを表示する
// （globals.cssの@media(max-width:767px)）。ログアウトは設定画面（/settings）のアカウントカードから行う。
export default function HeaderUserMenu({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <div className="user">
        {children}
        <span className="avatar">G</span>
        <form action="/auth/signout" method="post">
          <button type="submit">ログアウト</button>
        </form>
      </div>
      <Link className="settings-btn" href="/settings" aria-label="設定">
        ⚙
      </Link>
    </>
  );
}
