export default function LoginPage() {
  return (
    <main className="login-shell">
      <div className="login-card">
        <svg className="login-mark" width="56" height="56" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect width="512" height="512" rx="112" fill="#1d3440" />
          <rect x="140" y="96" width="232" height="312" rx="28" fill="#f7faf8" />
          <rect x="176" y="148" width="160" height="30" rx="8" fill="#087f78" />
          <rect x="176" y="202" width="160" height="14" rx="7" fill="#cfe0dd" />
          <rect x="176" y="230" width="108" height="14" rx="7" fill="#cfe0dd" />
          <circle cx="380" cy="380" r="56" fill="#087f78" stroke="#1d3440" strokeWidth="14" />
        </svg>
        <p className="login-word">
          research<span>·</span>desk
        </p>
        <p className="login-lead">
          決めた条件で自動収集しつつクリップを溜め、AIアプリに要約させて資料として書き出す個人用ツールです。
        </p>
        {/*
          ログイン開始はサーバー側のRoute Handlerへの素のリンクにする。onClickで
          signInWithOAuthを呼ぶ実装だと、ハイドレーション未完了の間はボタンが反応しない
          （guchi-apps/docs の knowledge/supabase.md「ログインの開始はサーバー側で行う」）。
        */}
        <a className="login-cta" href="/auth/signin">
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#fff" d="M17.6 9.2c0-.6-.06-1.18-.16-1.73H9v3.28h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.66-3.87 2.66-6.53z" />
            <path fill="#fff" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#fff" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03z" />
            <path fill="#fff" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.42 0 9 0A9 9 0 0 0 .96 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
          </svg>
          Googleでログイン
        </a>
        <p className="login-foot">許可された Google アカウントのみ利用できます</p>
      </div>
    </main>
  );
}
