"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { isAnalysisInFlight } from "@/lib/analysis-display";
import type { JobStatusValue } from "@/lib/article-analysis";

type Props = {
  articleId: string;
  status: JobStatusValue | null;
  weeklyCandidate: boolean;
  /** 記事詳細画面では「詳細を見る」を出さない。 */
  showDetailLink?: boolean;
};

/**
 * カード・記事詳細から解析を要求する操作（#79）。
 *
 * 実行するのはVPS上のポーラーなので、押した直後に結果は出ない。押した時点でジョブが
 * 「解析待ち」として残り、画面を開き直すか自動更新で状態が進む。二重実行は
 * `QUEUED`／`RUNNING`の間ボタンを無効にするだけでなく、サーバー側でも`activeKey`のUNIQUE制約で
 * 弾く（同時に押されても1本しか積まれない）。
 */
export default function ArticleAnalysisActions({ articleId, status, weeklyCandidate, showDetailLink = true }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = isAnalysisInFlight(status);

  async function post(path: string, body: Record<string, unknown>) {
    setError(null);
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (response.status === 409) {
      setError("この記事の解析はすでに実行中です。");
    } else if (!response.ok) {
      setError("操作できませんでした。しばらくしてからもう一度お試しください。");
    }
    startTransition(() => router.refresh());
  }

  return (
    <span className="ai-actions">
      <button className={`btn ${status === null ? "primary" : "quiet"}`} type="button" disabled={inFlight || pending} onClick={() => void post("/api/analysis/jobs", { articleId })}>
        {status === null ? "AI解析" : "再解析"}
      </button>
      <button className="btn" type="button" disabled={pending} onClick={() => void post("/api/analysis/review", { articleId, weeklyCandidate: !weeklyCandidate })}>
        {weeklyCandidate ? "週報候補から外す" : "週報候補に戻す"}
      </button>
      {showDetailLink && <Link className="btn quiet" href={`/dashboard/articles/${articleId}`}>詳細を見る</Link>}
      {error && <span className="ai-error">{error}</span>}
    </span>
  );
}
