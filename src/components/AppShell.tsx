"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import SidebarNav from "@/components/SidebarNav";
import { EDGE_ZONE_PX, SWIPE_DIRECTION_RATIO, SWIPE_MIN_DISTANCE_PX } from "@/lib/nav-swipe";

const IMAGE_MAIL_PATH = "/dashboard/image-mail";
const SETTINGS_PATH = "/settings";

// アプリ全体の外殻。PC・iPad（768px以上）ではサイドバーを左に出したままにし、スマホでは
// globals.cssの`@media(max-width:767px)`でサイドバーを引き出し（ドロワー）へ切り替え、
// 上部の固定バーから開けるようにする（#80。それまでスマホはサイドバーごと非表示で、
// 「画像を送る」画面への導線が画面上に1つも無かった）。
//
// クライアントコンポーネントだが、`children`はpropsとしてそのまま受け取るだけなので、
// 配下のpage.tsxはサーバーコンポーネントのまま描画される。サイドバーがこの外殻に留まる点も
// #73と変わらず、遷移のたびに再マウントされることはない。
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // ドロワー内のリンクを選んだら閉じる。`usePathname()`の変化を`useEffect`で拾う書き方は
  // effect内のsetStateになり、react-hooks/set-state-in-effectで弾かれるためクリック側で閉じる。
  function closeIfLinkClicked(event: React.MouseEvent<HTMLElement>) {
    if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
  }

  // 開いている間は背面をスクロールさせない。閉じたときとアンマウント時に必ず戻す。
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    let start: { x: number; y: number } | null = null;
    let fromEdge = false;

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        start = null;
        return;
      }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
      fromEdge = touch.clientX <= EDGE_ZONE_PX;
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
      // 左端からの右スワイプで開き、どこからでも左スワイプで閉じる。
      if (dx > 0) {
        if (fromEdge) setOpen(true);
      } else {
        setOpen(false);
      }
    }

    function handleTouchCancel() {
      start = null;
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchCancel, { passive: true });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, []);

  return (
    <main className={open ? "app-shell nav-open" : "app-shell"}>
      {/* スマホ専用の固定バー。PC・iPadではglobals.cssで非表示にする。 */}
      <div className="mobile-bar">
        <button type="button" className="menu-btn" aria-expanded={open} aria-label={open ? "メニューを閉じる" : "メニューを開く"} onClick={() => setOpen((current) => !current)}>
          {open ? "✕" : "☰"}
        </button>
        <span className="mobile-bar-spacer" />
        {pathname !== IMAGE_MAIL_PATH && <Link className="icon-btn" href={IMAGE_MAIL_PATH} aria-label="画像を社用メールに送る" onClick={() => setOpen(false)}>📷</Link>}
        {pathname !== SETTINGS_PATH && <Link className="icon-btn" href={SETTINGS_PATH} aria-label="設定" onClick={() => setOpen(false)}>⚙</Link>}
      </div>
      <aside className="sidebar" onClick={closeIfLinkClicked}>
        <div className="brand">
          research<span>·</span>desk
        </div>
        <SidebarNav />
      </aside>
      <button type="button" className="nav-scrim" tabIndex={open ? 0 : -1} aria-label="メニューを閉じる" onClick={() => setOpen(false)} />
      {children}
    </main>
  );
}
