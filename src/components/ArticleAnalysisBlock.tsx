import ArticleAnalysisActions from "@/components/ArticleAnalysisActions";
import { ANALYSIS_STATUS_CLASS, ANALYSIS_STATUS_LABELS, FAILURE_KIND_LABELS, formatConfidence, RELEVANCE_LABELS } from "@/lib/analysis-display";
import { formatDateTime, type IndustryInformationListItem } from "@/lib/industry-information";

/**
 * 記事カードに付くAI解析ブロック（#79）。
 *
 * 状態（未解析／解析待ち／解析中／完了／失敗／認証待ち）と、完了していれば判定・信頼度・
 * 判定理由を出す。人が確定済みの記事は「人が確定」と表示し、AIの判定と区別できるようにする。
 */
export default function ArticleAnalysisBlock({ item }: { item: IndustryInformationListItem }) {
  const job = item.analysisJobs[0] ?? null;
  const analysis = item.analyses[0] ?? null;
  const status = item.analysisStatus;
  const reviewed = item.reviewedAt !== null;

  return (
    <div className="ai-block">
      <div className="ai-row">
        <span className="ai-label">AI解析</span>
        {status === null ? (
          <span className="chip queued">未解析</span>
        ) : (
          <span className={`chip ${ANALYSIS_STATUS_CLASS[status]}`}>
            <i className="dot" />
            {ANALYSIS_STATUS_LABELS[status]}
            {status === "COMPLETED" && item.analyzedAt ? ` ${formatDateTime(item.analyzedAt)}` : ""}
          </span>
        )}
        {analysis && <span className="verdict">{RELEVANCE_LABELS[analysis.relevance]}</span>}
        {analysis && <span className="conf">信頼度 {formatConfidence(analysis.confidence)}</span>}
        {analysis && <span className={`by ${reviewed ? "human" : "ai"}`}>{reviewed ? "人が確定" : "AI判定"}</span>}
        {!item.weeklyCandidate && <span className="chip outscope">週報から除外</span>}
        <ArticleAnalysisActions articleId={item.id} status={status} weeklyCandidate={item.weeklyCandidate} />
      </div>
      {analysis && <p className="ai-reason">判定理由: {analysis.reason}</p>}
      {job && (status === "FAILED" || status === "AUTH_REQUIRED") && (
        <p className={`ai-hint ${status === "FAILED" ? "fail" : ""}`}>
          {job.failureKind ? FAILURE_KIND_LABELS[job.failureKind] : "解析に失敗しました"}
          {job.failureMessage ? `　${job.failureMessage}` : ""}
          {status === "AUTH_REQUIRED" && <>　VPSで <code>codex login status</code> を確認し、<code>codex login</code> でログインし直すと、この記事はそのまま再実行できます。記事データは失われていません。</>}
        </p>
      )}
      {status === "RUNNING" && <p className="ai-reason">VPS上で実行中です。完了するまで「AI解析」は押せません（同じ記事の二重実行を防ぐため）。</p>}
    </div>
  );
}
