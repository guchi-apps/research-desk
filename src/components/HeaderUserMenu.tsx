// PC・iPad向けのヘッダー右上（アバター＋ログアウト）。スマホ幅（767px以下）では`.user`ごと
// 隠れる（globals.cssの@media(max-width:767px)）。設定（⚙）と「画像を送る」（📷）への導線は
// スマホ専用の固定バー（`AppShell`）が持ち、ログアウトは設定画面のアカウントカードから行う。
export default function HeaderUserMenu({ children }: { children?: React.ReactNode }) {
  return (
    <div className="user">
      {children}
      <span className="avatar">G</span>
      <form action="/auth/signout" method="post">
        <button type="submit">ログアウト</button>
      </form>
    </div>
  );
}
