export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">research-desk</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-400">
          決めた条件で自動収集しつつクリップを溜め、AIアプリに要約させて資料として書き出す個人用ツールです。
        </p>
      </div>
      {/*
        ログイン開始はサーバー側のRoute Handlerへの素のリンクにする。onClickで
        signInWithOAuthを呼ぶ実装だと、ハイドレーション未完了の間はボタンが反応しない
        （guchi-apps/docs の knowledge/supabase.md「ログインの開始はサーバー側で行う」）。
      */}
      <a
        href="/auth/signin"
        className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
      >
        Googleでログイン
      </a>
    </main>
  );
}
