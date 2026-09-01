"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EDGE_ZONE_PX, SWIPE_DIRECTION_RATIO, SWIPE_MIN_DISTANCE_PX } from "@/lib/nav-swipe";

type Point = { x: number; y: number };

// dashboard/page.tsxの週送り（week-navの‹・›）と同じ遷移先を、スマホでの左右スワイプでも
// 発火できるようにする。PC（マウス操作）はtouch系イベントが発火しないため対象外になる。
// DOMは描画せず、globals.cssで定義済みの`.content`（レイアウト用クラス）へ直接リスナーを
// 付ける。prevHref/nextHrefが`null`（週の範囲外）のときは何もしない。
export default function SwipeWeekNav({ prevHref, nextHref }: { prevHref: string | null; nextHref: string | null }) {
  const router = useRouter();

  useEffect(() => {
    const content = document.querySelector<HTMLElement>(".content");
    if (!content) return;

    let start: Point | null = null;

    function handleTouchStart(event: TouchEvent) {
      // 複数指（ピンチズーム等）、.filters（モバイルで横スクロールするフィルターUI）上の
      // 操作は無視する。
      const target = event.target;
      if (event.touches.length !== 1 || (target instanceof Element && target.closest(".filters"))) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      // 画面左端から始まったスワイプはメニューの引き出し（`AppShell`）の担当なので、
      // 週送りとしては扱わない。両方が反応すると、開いたメニューの背後で週が変わる（#80）。
      if (touch.clientX <= EDGE_ZONE_PX) {
        start = null;
        return;
      }
      start = { x: touch.clientX, y: touch.clientY };
    }

    function handleTouchEnd(event: TouchEvent) {
      const origin = start;
      start = null;
      if (!origin || event.touches.length !== 0) return; // 全指が離れるまで確定しない
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      const absDx = Math.abs(dx);
      if (absDx < SWIPE_MIN_DISTANCE_PX || absDx < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return;
      const href = dx < 0 ? nextHref : prevHref; // 左スワイプ→次週、右スワイプ→前週
      if (href) router.push(href);
    }

    function handleTouchCancel() {
      start = null;
    }

    content.addEventListener("touchstart", handleTouchStart, { passive: true });
    content.addEventListener("touchend", handleTouchEnd, { passive: true });
    content.addEventListener("touchcancel", handleTouchCancel, { passive: true });
    return () => {
      content.removeEventListener("touchstart", handleTouchStart);
      content.removeEventListener("touchend", handleTouchEnd);
      content.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [prevHref, nextHref, router]);

  return null;
}
