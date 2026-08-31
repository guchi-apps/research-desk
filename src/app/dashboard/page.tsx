import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SwipeWeekNav from "@/components/SwipeWeekNav";
import { OLDEST_WEEK_OFFSET, formatDate, formatDateTime, formatMetrics, formatWeekLabel, getLastCollectedAt, getLatestCollectionRunId, getWeekRange, listIndustryInformation, parseWeekOffset, toMergedSources, toStringArray, type BusinessParam, type ImportanceParam, type IndustryInformationListItem, type SourceParam } from "@/lib/industry-information";

// 週報の登録はAIDE経由の`POST /api/internal/weekly-report`だけで、この画面は表示専用。
// 1週ぶんは全体6件・各事業3件までのため、絞り込み後の件数はそのまま描画してよい大きさに収まる。
// 登録直後に開いても古い内容を返さないよう、毎リクエストでDBを読む。
export const dynamic = "force-dynamic";

type Business = "DELIVERY" | "LOCKER";

const labels: Record<Business, string> = { DELIVERY: "宅配事業", LOCKER: "ロッカー事業" };
const importanceLabels = { HIGH: "高", MEDIUM: "中", REFERENCE: "参考" } as const;

// 直近の収集ランと比べ、このカードが「新規追加」「内容更新」のどちらかを判定する（#43）。
// collectionRunIdは作成時のランのまま不変（週判定に使うため）、updatedByRunIdはマージのたびに
// 現在のランへ更新される。両方が直近ランと一致しない場合はバッジを出さない。
function cardStatus(item: IndustryInformationListItem, latestRunId: string | null): "new" | "updated" | null {
  if (!latestRunId) return null;
  if (item.collectionRunId === latestRunId) return "new";
  if (item.updatedByRunId === latestRunId) return "updated";
  return null;
}

function Card({ item, latestRunId }: { item: IndustryInformationListItem; latestRunId: string | null }) {
  const supplement = item.periodScope === "PAST_30_DAYS_SUPPLEMENT";
  const keywords = toStringArray(item.keywords);
  const tags = toStringArray(item.tags);
  const status = cardStatus(item, latestRunId);
  const mergedSources = toMergedSources(item.mergedSources);
  return <article className={`news-card ${supplement ? "supplement" : ""}`}>
    <div className="news-head">
      <div><h3>{item.title}</h3><p className="meta">{formatDate(item.publishedAt ?? item.occurredAt ?? item.collectedAt)}　·　{item.sourceName}　·　{item.isPrimarySource ? "一次情報" : "関連記事"}</p></div>
      <div className="badge-col">
        {status && <span className={`status-pill ${status}`}>{status === "new" ? "NEW" : "更新"}</span>}
        <span className={`badge ${item.importance === "HIGH" ? "high" : ""}`}>{supplement ? "30日以内" : `重要度 ${importanceLabels[item.importance]}`}</span>
      </div>
    </div>
    <p className="summary">{item.summary ?? "要約は登録されていません。"}</p>
    <dl className="details"><div><dt>主な数値・事実</dt><dd>{formatMetrics(item.extractedMetrics) ?? "—"}</dd></div><div><dt>企画・設計への示唆</dt><dd>{item.implications ?? "—"}</dd></div><div><dt>キーワード</dt><dd>{keywords.length ? keywords.join("／") : "—"}</dd></div></dl>
    <div className="news-foot"><div className="tags">{item.targetCompany && <b>{item.targetCompany}</b>}{item.targetProduct && <span>{item.targetProduct}</span>}{tags.map((tag) => <span key={tag}>{tag}</span>)}</div><a href={item.originalUrl} target="_blank" rel="noreferrer">元記事 ↗</a></div>
    {mergedSources.length > 0 && <details className="merge-info">
      <summary>更新履歴を見る</summary>
      <div className="merge-body">
        <div className="row"><dt>統合元URL（{mergedSources.length + 1}件）</dt><dd>
          <a href={item.originalUrl} target="_blank" rel="noreferrer">{item.originalUrl}（{item.isPrimarySource ? "一次情報" : "転載"}）</a>
          {mergedSources.map((source) => <a key={source.normalizedUrl} href={source.url} target="_blank" rel="noreferrer">{source.url}（{source.isPrimarySource ? "一次情報" : "転載"}）</a>)}
        </dd></div>
        <div className="row"><dt>最終更新日時</dt><dd>{formatDateTime(item.updatedAt)}</dd></div>
        <div className="row"><dt>更新理由</dt><dd>{item.updateReason ?? "—"}</dd></div>
      </div>
    </details>}
  </article>;
}

function Section({ business, items, latestRunId }: { business: Business; items: IndustryInformationListItem[]; latestRunId: string | null }) {
  return <section className="news-section"><div className="section-heading section-line"><div className="section-title"><i className={business === "LOCKER" ? "orange" : ""} /><h2>{labels[business]}</h2><span>{items.length}件</span></div><p>{business === "DELIVERY" ? "戸建て · 宅配ボックス · 機能門柱 · 外構" : "マルチロッカー · セルフ発送 · 競合・類似サービス"}</p></div><div className="news-list">{items.map((item) => <Card key={item.id} item={item} latestRunId={latestRunId} />)}</div></section>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (user.status === "unavailable") return <main className="empty-state"><p>認証状態を確認できませんでした。しばらくしてから再読み込みしてください。</p></main>;
  if (user.status === "unauthenticated") redirect("/login");
  const params = await searchParams;
  const business: BusinessParam = params.business === "delivery" || params.business === "locker" ? params.business : "all";
  const source: SourceParam = params.source === "primary" || params.source === "related" ? params.source : "all";
  const importance: ImportanceParam = params.importance === "high" || params.importance === "medium" || params.importance === "reference" ? params.importance : "all";
  const weekOffset = parseWeekOffset(params.week);
  const keyword = typeof params.keyword === "string" ? params.keyword.trim() : "";
  const [visible, lastCollectedAt, latestRunId] = await Promise.all([listIndustryInformation({ weekOffset, business, source, importance, keyword }), getLastCollectedAt(), getLatestCollectionRunId()]);
  const query = (newWeek: number) => `/dashboard?week=${newWeek}&business=${business}&source=${source}&importance=${importance}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`;
  const prevHref = weekOffset > OLDEST_WEEK_OFFSET ? query(weekOffset - 1) : null;
  const nextHref = weekOffset < 0 ? query(weekOffset + 1) : null;
  const pointTitle = weekOffset === 0 ? "今週の要点" : "この週の要点";
  // 要点は登録データの先頭（重要度順）を事業ごとに1件ずつ拾う。文言は持たない。
  const keyPoints = (["DELIVERY", "LOCKER"] as const).map((key) => ({ business: key, item: visible.find((news) => news.business === key) })).filter((point): point is { business: Business; item: IndustryInformationListItem } => Boolean(point.item));
  return <main className="app-shell"><aside className="sidebar"><div className="brand">research<span>·</span>desk</div><p className="sidebar-label">WORKSPACE</p><nav><Link href="/">⌂　新着記事</Link><a className="active" href="/dashboard">▦　業界ニュース</a><a href="/dashboard">☆　保存した情報</a><a href="/dashboard">↗　書き出し</a></nav><p className="sidebar-label topic">TOPICS</p><nav><a href="/dashboard?business=delivery">宅配事業</a><a href="/dashboard?business=locker">ロッカー事業</a></nav></aside><section className="content"><SwipeWeekNav prevHref={prevHref} nextHref={nextHref} /><header className="page-header"><div><p className="eyebrow">WEEKLY INDUSTRY BRIEF</p><h1>業界ニュース</h1></div><div className="top-actions"><Link className="cta back" href="/">⌂　新着記事に戻る</Link><div className="user"><span>{lastCollectedAt ? `最終更新 ${formatDateTime(lastCollectedAt)}` : "未登録"}</span><span className="avatar">G</span><form action="/auth/signout" method="post"><button type="submit">ログアウト</button></form></div></div></header><div className="week-nav"><a href={query(Math.max(OLDEST_WEEK_OFFSET, weekOffset - 1))}>‹</a><strong>{formatWeekLabel(getWeekRange(weekOffset))}</strong><a className={weekOffset === 0 ? "disabled" : ""} href={query(Math.min(0, weekOffset + 1))}>›</a></div>{keyPoints.length > 0 && <section className="key-points"><div className="section-heading"><h2>{pointTitle}</h2><span>{visible.length}件 · 重要度順</span></div><div className="key-grid">{keyPoints.map((point, index) => <div key={point.business}><small>{labels[point.business]}　{String(index + 1).padStart(2, "0")}</small><p>{point.item.title}</p></div>)}</div></section>}<form className="filters" method="get"><input type="hidden" name="week" value={weekOffset} /><label>事業区分<select name="business" defaultValue={business}><option value="all">すべて</option><option value="delivery">宅配事業</option><option value="locker">ロッカー事業</option></select></label><label>情報区分<select name="source" defaultValue={source}><option value="all">すべて</option><option value="primary">一次情報</option><option value="related">関連記事</option></select></label><label>重要度<select name="importance" defaultValue={importance}><option value="all">すべて</option><option value="high">高</option><option value="medium">中</option><option value="reference">参考</option></select></label><label className="keyword">企業・商品<input name="keyword" placeholder="キーワード" defaultValue={keyword} /></label><button type="submit">絞り込む</button></form><Section business="DELIVERY" items={visible.filter((item) => item.business === "DELIVERY")} latestRunId={latestRunId} /><Section business="LOCKER" items={visible.filter((item) => item.business === "LOCKER")} latestRunId={latestRunId} />{visible.length === 0 && <div className="no-results">条件に一致する情報はありません。期間や絞り込み条件を変えてお試しください。</div>}<p className="note">※ 要約は保存済みの調査結果を表示しています。転載記事は同一発表にまとめ、一次情報と関連記事を区別しています。</p></section></main>;
}
