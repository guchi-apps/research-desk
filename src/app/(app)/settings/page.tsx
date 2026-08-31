import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { APP_CHANGELOG } from "@/lib/changelog";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (user.status === "unavailable") return <section className="content"><div className="empty-state"><p>認証状態を確認できませんでした。しばらくしてから再読み込みしてください。</p></div></section>;
  if (user.status === "unauthenticated") redirect("/login");

  return <section className="content"><header className="page-header"><div><p className="eyebrow">SETTINGS</p><h1>設定</h1><p className="lead">アカウント情報の確認と、アプリの更新履歴をまとめて確認できます。</p></div><Link className="cta back" href="/">⌂　新着記事に戻る</Link></header>
    <div className="settings-card">
      <h2>アカウント</h2>
      <p className="desc">ログイン中のGoogleアカウント</p>
      <div className="account-row">
        <div className="who"><span className="avatar">G</span><p className="email">{user.user.email}</p></div>
        <form action="/auth/signout" method="post"><button type="submit" className="logout-btn">ログアウト</button></form>
      </div>
    </div>
    <div className="settings-card">
      <h2>更新履歴</h2>
      <p className="desc">バージョンごとに、画面で体感できる変更点をまとめています。</p>
      <div className="changelog">
        {APP_CHANGELOG.map((entry, index) => <details key={entry.version} className="changelog-entry" open={index === 0}>
          <summary className="changelog-head"><span className="ver-pill">v{entry.version}</span><span className="ver-date">{entry.date}</span></summary>
          <div className="changelog-body">
            {entry.changes.map((change) => <p key={change}>{change}</p>)}
            {entry.usage && <><p className="usage-label">使い方</p><ol>{entry.usage.map((step) => <li key={step}>{step}</li>)}</ol></>}
          </div>
        </details>)}
      </div>
    </div>
  </section>;
}
