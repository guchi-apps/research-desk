"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * サーバーコンポーネントの画面を一定間隔で読み直す（#137。解析状況画面）。
 *
 * タブが裏にある間は読み直さず、表に戻った時点で1回読み直す。開きっぱなしのタブが
 * DBへ問い合わせ続けないようにするため。
 */
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router, seconds]);

  return null;
}
