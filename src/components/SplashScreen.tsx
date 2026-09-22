import { BrandMark, Wordmark } from "@/components/BrandMark";

// `loading.tsx`のフォールバックと、アップデート後のリロード中オーバーレイ（AppUpdateChecker）の
// 両方から使う共通のスプラッシュ表示。文言だけを出し分ける。
export default function SplashScreen({ label = "Loading" }: { label?: string }) {
  return (
    <main className="splash-shell" aria-label="読み込み中">
      <BrandMark variant="bare" size={84} className="splash-mark" />
      <div>
        <p className="splash-word">
          <Wordmark tone="dark" />
        </p>
        <p className="splash-sub">{label}</p>
      </div>
    </main>
  );
}
