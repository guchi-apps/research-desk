import SplashScreen from "@/components/SplashScreen";

// ルート直下に置くことで、サーバー側の認証確認・DB取得中（`page.tsx`・`login/page.tsx`・
// `dashboard/page.tsx`のいずれも`await`を含む）にSuspenseのフォールバックとして表示される
// （#46）。ページ遷移のたびにも一瞬表示されるが、Next.js標準の仕組みで完結させるため許容する。
export default function Loading() {
  return <SplashScreen />;
}
