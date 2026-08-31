// `loading.tsx`のフォールバックと、アップデート後のリロード中オーバーレイ（AppUpdateChecker）の
// 両方から使う共通のスプラッシュ表示。文言だけを出し分ける。
export default function SplashScreen({ label = "Loading" }: { label?: string }) {
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
        <p className="splash-sub">{label}</p>
      </div>
    </main>
  );
}
