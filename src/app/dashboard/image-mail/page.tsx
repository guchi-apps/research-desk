import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ImageMailPanel from "@/components/ImageMailPanel";

export default async function ImageMailPage() {
  const user = await getCurrentUser();
  if (user.status === "unavailable") return <main className="empty-state"><p>認証状態を確認できませんでした。しばらくしてから再読み込みしてください。</p></main>;
  if (user.status === "unauthenticated") redirect("/login");

  return <main className="app-shell"><aside className="sidebar"><div className="brand">research<span>·</span>desk</div><p className="sidebar-label">WORKSPACE</p><nav><Link href="/">⌂　新着記事</Link><Link href="/dashboard">▦　業界ニュース</Link><Link className="active" href="/dashboard/image-mail">📷　画像を送る</Link><a href="/dashboard">☆　保存した情報</a></nav><p className="sidebar-label topic">TOPICS</p><nav><a href="/dashboard?business=delivery">宅配事業</a><a href="/dashboard?business=locker">ロッカー事業</a></nav></aside><section className="content"><header className="page-header"><div><p className="eyebrow">SEND TO EMAIL</p><h1>画像を社用メールに送る</h1><p className="lead">撮影・選択した写真をJPEGへ圧縮してZIP化し、AIDE経由で社用メールへ即時送信します。画像はResearch Desk・AIDEのどちらにも保存されません。</p></div><div className="user"><span className="avatar">G</span><form action="/auth/signout" method="post"><button type="submit">ログアウト</button></form></div></header><ImageMailPanel /></section></main>;
}
