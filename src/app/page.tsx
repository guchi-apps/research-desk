import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, getRecencyLabel, listRecentIndustryInformation, toStringArray, type IndustryInformationListItem, type RecencyLabel } from "@/lib/industry-information";

// 新着記事はAIDE経由の`POST /api/internal/weekly-report`等で登録され次第この画面に出る。
// 登録直後に開いても古い内容を返さないよう、毎リクエストでDBを読む。
export const dynamic = "force-dynamic";

const labels = { DELIVERY: "宅配事業", LOCKER: "ロッカー事業" } as const;
const importanceLabels = { HIGH: "高", MEDIUM: "中", REFERENCE: "参考" } as const;
const dayHeadings: Record<RecencyLabel, string> = { today: "今日", yesterday: "昨日", earlier: "それ以前" };

function RecentCard({ item }: { item: IndustryInformationListItem }) {
  const tags = toStringArray(item.tags);
  return <article className="news-card"><div className="biz"><i className={item.business === "LOCKER" ? "orange" : ""} />{labels[item.business]}</div><div className="news-head"><div><h3>{item.title}</h3><p className="meta">{formatDate(item.publishedAt ?? item.collectedAt)}　·　{item.sourceName}　·　{item.isPrimarySource ? "一次情報" : "関連記事"}</p></div><span className={`badge ${item.importance === "HIGH" ? "high" : ""}`}>重要度 {importanceLabels[item.importance]}</span></div><p className="summary">{item.summary ?? "要約は登録されていません。"}</p><div className="news-foot"><div className="tags">{item.targetCompany && <b>{item.targetCompany}</b>}{tags.map((tag) => <span key={tag}>{tag}</span>)}</div><a href={item.originalUrl} target="_blank" rel="noreferrer">元記事 ↗</a></div></article>;
}

function DayGroup({ label, items }: { label: RecencyLabel; items: IndustryInformationListItem[] }) {
  if (items.length === 0) return null;
  return <div className="day-group"><div className="day-heading"><h2>{dayHeadings[label]}</h2><span className="pill">{formatDate(items[0].collectedAt)}</span><span className="count">{items.length}件</span></div><div className="news-list">{items.map((item) => <RecentCard key={item.id} item={item} />)}</div></div>;
}

export default async function Home() {
  const user = await getCurrentUser();
  if (user.status === "unavailable") return <main className="empty-state"><p>認証状態を確認できませんでした。しばらくしてから再読み込みしてください。</p></main>;
  if (user.status === "unauthenticated") redirect("/login");
  const recent = await listRecentIndustryInformation();
  const groups: Record<RecencyLabel, IndustryInformationListItem[]> = { today: [], yesterday: [], earlier: [] };
  for (const item of recent) groups[getRecencyLabel(item.collectedAt)].push(item);
  return <main className="app-shell"><aside className="sidebar"><div className="brand">research<span>·</span>desk</div><p className="sidebar-label">WORKSPACE</p><nav><Link className="active" href="/">⌂　新着記事</Link><a href="/dashboard">▦　業界ニュース</a><a href="/dashboard">☆　保存した情報</a><a href="/dashboard">↗　書き出し</a></nav><p className="sidebar-label topic">TOPICS</p><nav><a href="/dashboard?business=delivery">宅配事業</a><a href="/dashboard?business=locker">ロッカー事業</a></nav></aside><section className="content"><header className="page-header"><div><p className="eyebrow">LATEST UPDATES</p><h1>新着記事</h1><p className="lead">直近で反映された記事を新しい順に表示しています。事業ごとの絞り込みや週送りは業界ニュース画面で行えます。</p></div><div className="top-actions"><a className="cta" href="/dashboard">業界ニュースを見る　▦</a><div className="user"><span className="avatar">G</span><form action="/auth/signout" method="post"><button type="submit">ログアウト</button></form></div></div></header>{recent.length === 0 ? <div className="no-results">新着記事はまだありません。収集・週報登録が行われるとここに表示されます。</div> : <>{(["today", "yesterday", "earlier"] as const).map((label) => <DayGroup key={label} label={label} items={groups[label]} />)}<p className="bottom-link"><a href="/dashboard">すべての業界ニュースを見る　▦</a></p></>}</section></main>;
}
