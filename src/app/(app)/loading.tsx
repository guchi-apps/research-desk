import { DashboardSkeleton } from "@/components/skeletons";

// `/`（`(app)/page.tsx`）は認証チェック後に`/dashboard`へredirectするだけなので、
// このフォールバックの間だけ一瞬見える形は行き先（業界ニュース画面）に合わせておく（#124）。
export default function Loading() {
  return <DashboardSkeleton />;
}
