// ルート直下に置くことで、サーバー側の認証確認・DB取得中（`page.tsx`・`login/page.tsx`・
// `dashboard/page.tsx`のいずれも`await`を含む）にSuspenseのフォールバックとして表示される
// （#46）。ページ遷移のたびにも一瞬表示されるが、Next.js標準の仕組みで完結させるため許容する。
export default function Loading() {
  return (
    <main className="splash-shell" aria-label="読み込み中">
      <svg className="splash-mark" width="88" height="72" viewBox="96 60 320 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="140" y="96" width="232" height="312" rx="28" fill="#f7faf8" />
        <rect x="176" y="148" width="160" height="30" rx="8" fill="#087f78" />
        <rect x="176" y="202" width="160" height="14" rx="7" fill="#cfe0dd" />
        <rect x="176" y="230" width="108" height="14" rx="7" fill="#cfe0dd" />
        <circle cx="380" cy="380" r="56" fill="#087f78" stroke="#1d3440" strokeWidth="14" />
      </svg>
      <div>
        <p className="splash-word">
          research<span>·</span>desk
        </p>
        <p className="splash-sub">Loading</p>
      </div>
    </main>
  );
}
