import { redirect } from "next/navigation";
import HeaderUserMenu from "@/components/HeaderUserMenu";
import { getCurrentUser } from "@/lib/auth";
import ImageMailPanel from "@/components/ImageMailPanel";

export default async function ImageMailPage() {
  const user = await getCurrentUser();
  if (user.status === "unavailable") return <section className="content"><div className="empty-state"><p>認証状態を確認できませんでした。しばらくしてから再読み込みしてください。</p></div></section>;
  if (user.status === "unauthenticated") redirect("/login");

  return <section className="content"><header className="page-header"><div><p className="eyebrow">SEND TO EMAIL</p><h1>画像を社用メールに送る</h1><p className="lead">撮影・選択した写真をJPEGへ圧縮してZIP化し、AIDE経由で社用メールへ即時送信します。画像はResearch Desk・AIDEのどちらにも保存されません。</p></div><div className="top-actions"><HeaderUserMenu /></div></header><ImageMailPanel /></section>;
}
