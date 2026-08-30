import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();

  if (currentUser.status === "unavailable") {
    return (
      <main className="p-6">
        <p className="text-sm text-slate-400">
          認証状態を確認できませんでした。しばらくしてから再読み込みしてください。
        </p>
      </main>
    );
  }

  if (currentUser.status === "unauthenticated") {
    redirect("/login");
  }

  const clips = await prisma.clip.findMany({
    orderBy: { collectedAt: "desc" },
    take: 20,
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">クリップ一覧</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-slate-400 hover:text-slate-200">
            ログアウト
          </button>
        </form>
      </header>

      {clips.length === 0 ? (
        <p className="text-sm text-slate-400">まだクリップがありません。</p>
      ) : (
        <ul className="space-y-3">
          {clips.map((clip) => (
            <li key={clip.id} className="rounded-md border border-slate-800 p-4">
              <p className="font-medium">{clip.title}</p>
              {clip.source ? <p className="mt-1 text-xs text-slate-500">{clip.source}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
