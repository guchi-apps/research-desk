import SplashScreen from "@/components/SplashScreen";

// `/`・`/dashboard`・`/dashboard/image-mail`・`/settings`は`(app)/layout.tsx`と
// 各ルート専用の`loading.tsx`（`src/components/skeletons.tsx`）を持つため、遷移中は
// そちらのスケルトンが使われる（#73）。ここは`(app)`グループの外側（`/login`など）や、
// 何らかの理由でより具体的な`loading.tsx`が無い場合に使われる最後の砦のフォールバック。
export default function Loading() {
  return <SplashScreen />;
}
