import Link from "next/link";
import { redirect } from "next/navigation";
import HeaderUserMenu from "@/components/HeaderUserMenu";
import { getCurrentUser } from "@/lib/auth";
import ImageMailPanel from "@/components/ImageMailPanel";

export default async function ImageMailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (user.status === "unavailable") return <section className="content"><div className="empty-state"><p>認証状態を確認できませんでした。しばらくしてから再読み込みしてください。</p></div></section>;
  if (user.status === "unauthenticated") redirect("/login");

  const params = await searchParams;
  const sharedId = typeof params.shared === "string" ? params.shared : null;
  const shareError = typeof params.shareError === "string" ? params.shareError : null;

  return <section className="content"><Link className="breadcrumb" href="/dashboard">‹　業界ニュースへ戻る</Link><header className="page-header"><div><p className="eyebrow">SEND TO EMAIL</p><h1>画像を社用メールに送る</h1><p className="lead">撮影・選択した写真をJPEGへ圧縮してZIP化し、AIDE経由で社用メールへ即時送信します。画像はワークリレー・AIDEのどちらにも保存されません。</p></div><div className="top-actions"><HeaderUserMenu /></div></header><ImageMailPanel sharedId={sharedId} shareError={shareError} /></section>;
}
