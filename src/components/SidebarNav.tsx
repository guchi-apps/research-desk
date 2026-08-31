"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 「☆ 保存した情報」「↗ 書き出し」は未実装のため暫定的に/dashboardを指しており、
// アクティブ表示の対象からは外す（元のマークアップでも常に非アクティブだった）。
const workspaceLinks = [
  { href: "/", label: "⌂　新着記事", markActive: true },
  { href: "/dashboard", label: "▦　業界ニュース", markActive: true },
  { href: "/dashboard/image-mail", label: "📷　画像を送る", markActive: true },
  { href: "/dashboard", label: "☆　保存した情報", markActive: false },
  { href: "/dashboard", label: "↗　書き出し", markActive: false },
];

const topicLinks = [
  { href: "/dashboard?business=delivery", label: "宅配事業" },
  { href: "/dashboard?business=locker", label: "ロッカー事業" },
];

export default function SidebarNav() {
  const pathname = usePathname();
  return (
    <>
      <p className="sidebar-label">WORKSPACE</p>
      <nav>
        {workspaceLinks.map((link, index) => (
          <Link key={index} className={link.markActive && pathname === link.href ? "active" : undefined} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="sidebar-label topic">TOPICS</p>
      <nav>
        {topicLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
