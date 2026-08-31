"use client";

import { useEffect, useRef, useState } from "react";

import SplashScreen from "@/components/SplashScreen";

// フォアグラウンドで使い続けているセッション向けの定期チェック間隔。
const POLL_INTERVAL_MS = 10 * 60 * 1000;

type AppUpdateCheckerProps = {
  currentVersion: string;
};

/**
 * PWAとしてホーム画面から起動された場合、Service Workerを使わずとも
 * ブラウザを再訪しない限り新しいビルドに気づけない（再インストールしないと
 * 更新されないように見える）。バージョン（package.jsonの値）をサーバーに
 * 問い合わせて比較し、新しいバージョンを検知したらバナーで案内する。
 *
 * issue-deckの同名コンポーネントと異なり、バックグラウンド復帰時の自動リロードは
 * 行わない。`/dashboard/image-mail`は画像選択・件名入力という未保存状態を持つ画面のため、
 * 気づかないうちにリロードされると入力が消える。更新は必ず「更新する」ボタン経由にする。
 */
export default function AppUpdateChecker({ currentVersion }: AppUpdateCheckerProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [reloading, setReloading] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    async function checkForUpdate() {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const res = await fetch("/api/app-version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (data.version && data.version !== currentVersion) setUpdateAvailable(true);
      } catch {
        // 通信できないだけなら何もしない。次のチェックタイミングで再試行する
      } finally {
        checkingRef.current = false;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void checkForUpdate();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(checkForUpdate, POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [currentVersion]);

  if (reloading) return <SplashScreen label="更新中" />;
  if (!updateAvailable) return null;

  return (
    <div className="update-banner">
      <p>新しいバージョンがあります</p>
      <button
        type="button"
        onClick={() => {
          setReloading(true);
          window.location.reload();
        }}
      >
        更新する
      </button>
    </div>
  );
}
