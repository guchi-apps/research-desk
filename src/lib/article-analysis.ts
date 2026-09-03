import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canAcceptReport, classifyFailure, FAILURE_MESSAGE_LIMIT, isDuplicateJobError, shouldAutoExcludeFromWeekly, truncateFailureMessage, type FailureKindValue, type FailureSignal, type JobStatusValue } from "@/lib/analysis-job-rules";
import { buildAnalysisPrompt, buildOutputSchema, parseAnalysisPayload, parseAnnouncedOn, type AnalysisImportanceValue, type AnalysisPeerArticle, type AnalysisRelevanceValue } from "@/lib/analysis-prompt";
import { getWeekRange, weekCondition } from "@/lib/industry-information";

export { FAILURE_MESSAGE_LIMIT };
export type { FailureKindValue, FailureSignal, JobStatusValue };

/**
 * 記事AI解析のジョブ管理（#79）。
 *
 * 画面がジョブを積み、VPS上の常駐ポーラーが`claim`で取得して`report`で返す。実行役は
 * ChatGPTアカウントでログインしたCodex CLIで、Research Deskのサーバーは外部AIへ一切接続しない。
 */

/** ポーラーがジョブを保持できる時間。これを過ぎたRUNNINGは落ちたとみなして再取得できる。 */
export const LEASE_SECONDS = 15 * 60;

/** 1回のclaimで渡せるジョブ数の上限。1件ずつ順に流す前提で小さくしてある。 */
export const MAX_CLAIM_JOBS = 3;

/** 重複判定のためにプロンプトへ載せる、同じ週の既存記事の件数上限。 */
const PEER_LIMIT = 12;

// --- ジョブの投入 ---------------------------------------------------------------------

export type EnqueueResult = { ok: true; jobId: string; attempt: number } | { ok: false; reason: "not_found" | "already_queued" };

/**
 * 記事1件の解析ジョブを積む。
 *
 * 同一記事に未完了（`QUEUED`／`RUNNING`）のジョブがあるときは積まない。判定はアプリ側の
 * 事前チェックではなく`activeKey`のUNIQUE制約で行う——複数プロセス（PM2）から同時に押されても
 * DBが1本に絞る（MySQLのUNIQUEはNULLの重複を許すので、終了時にnullへ戻せば次を積める）。
 */
export async function enqueueAnalysisJob(articleId: string, requestedBy: string | null): Promise<EnqueueResult> {
  const article = await prisma.industryInformation.findUnique({ where: { id: articleId }, select: { id: true } });
  if (!article) return { ok: false, reason: "not_found" };

  const attempt = (await prisma.articleAnalysisJob.count({ where: { articleId } })) + 1;
  try {
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.articleAnalysisJob.create({ data: { articleId, activeKey: articleId, requestedBy, attempt } });
      await tx.industryInformation.update({ where: { id: articleId }, data: { analysisStatus: "QUEUED" } });
      return created;
    });
    return { ok: true, jobId: job.id, attempt };
  } catch (error) {
    if (isDuplicateJobError(error)) return { ok: false, reason: "already_queued" };
    throw error;
  }
}

// --- ジョブの取得（ポーラー向け） -------------------------------------------------------

export type ClaimedJob = { jobId: string; articleId: string; articleTitle: string; prompt: string; outputSchema: Record<string, unknown>; leaseExpiresAt: string };
export type ClaimInput = { host: string; maxJobs: number; codexAuthMode: string | null; codexVersion: string | null };

/**
 * 期限切れのRUNNINGをQUEUEDへ戻す。ポーラーが落ちた・VPSが再起動した場合に、
 * ジョブが永久に「解析中」で残らないようにする。
 */
async function releaseExpiredLeases(now: Date): Promise<void> {
  const expired = await prisma.articleAnalysisJob.findMany({ where: { status: "RUNNING", leaseExpiresAt: { lt: now } }, select: { id: true, articleId: true } });
  if (expired.length === 0) return;
  await prisma.$transaction([
    prisma.articleAnalysisJob.updateMany({ where: { id: { in: expired.map((job) => job.id) } }, data: { status: "QUEUED", startedAt: null, leaseExpiresAt: null, workerHost: null } }),
    prisma.industryInformation.updateMany({ where: { id: { in: expired.map((job) => job.articleId) } }, data: { analysisStatus: "QUEUED" } }),
  ]);
}

/**
 * QUEUEDのジョブを取り、プロンプトと出力スキーマを付けて返す。
 *
 * `updateMany`の条件に`status: "QUEUED"`を残しているため、同じジョブを2つのポーラーが同時に
 * 取ろうとしても更新できた側だけが実行する（更新件数0なら次の候補へ進む）。
 */
export async function claimAnalysisJobs(input: ClaimInput, now = new Date()): Promise<ClaimedJob[]> {
  await prisma.analysisWorker.upsert({
    where: { host: input.host },
    create: { host: input.host, lastSeenAt: now, codexAuthMode: input.codexAuthMode, codexVersion: input.codexVersion },
    update: { lastSeenAt: now, codexAuthMode: input.codexAuthMode, codexVersion: input.codexVersion },
  });
  await releaseExpiredLeases(now);

  const take = Math.min(Math.max(input.maxJobs, 0), MAX_CLAIM_JOBS);
  if (take === 0) return [];

  const candidates = await prisma.articleAnalysisJob.findMany({ where: { status: "QUEUED" }, orderBy: { queuedAt: "asc" }, take, select: { id: true, articleId: true } });
  const leaseExpiresAt = new Date(now.getTime() + LEASE_SECONDS * 1000);
  const claimed: ClaimedJob[] = [];

  for (const candidate of candidates) {
    const updated = await prisma.articleAnalysisJob.updateMany({ where: { id: candidate.id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: now, leaseExpiresAt, workerHost: input.host } });
    if (updated.count === 0) continue;
    await prisma.industryInformation.update({ where: { id: candidate.articleId }, data: { analysisStatus: "RUNNING" } });

    const article = await prisma.industryInformation.findUnique({
      where: { id: candidate.articleId },
      select: { id: true, title: true, originalUrl: true, sourceName: true, publisher: true, business: true, publishedAt: true, occurredAt: true, collectedAt: true, content: true, summary: true },
    });
    if (!article) continue;

    claimed.push({
      jobId: candidate.id,
      articleId: article.id,
      articleTitle: article.title,
      prompt: buildAnalysisPrompt(article, await loadWeekPeers(article.id, article.publishedAt ?? article.occurredAt ?? article.collectedAt, now)),
      outputSchema: buildOutputSchema(),
      leaseExpiresAt: leaseExpiresAt.toISOString(),
    });
  }
  return claimed;
}

/** 重複候補の判定材料として、同じ週に登録済みの記事（自分以外）を渡す。 */
async function loadWeekPeers(articleId: string, reference: Date, now: Date): Promise<AnalysisPeerArticle[]> {
  // 表示側と同じ週の切り方（JST日曜0時始まり）を使う。参照日が何週前かを求めてから範囲にする。
  // 基準は今週の**始まり**にする（終わりを基準にすると、今週の日曜0時ちょうどの記事が
  // 1週前として扱われる）。未来日の記事は今週として扱う。
  const currentWeek = getWeekRange(0, now);
  const weeksAgo = Math.min(0, Math.floor((reference.getTime() - currentWeek.start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const peers = await prisma.industryInformation.findMany({
    where: { AND: [weekCondition(getWeekRange(weeksAgo, now)), { id: { not: articleId } }] },
    orderBy: [{ importance: "asc" }, { publishedAt: "desc" }],
    take: PEER_LIMIT,
    select: { title: true, originalUrl: true, business: true, publishedAt: true, summary: true },
  });
  return peers;
}

// --- 結果の返却（ポーラー向け） ---------------------------------------------------------

export type ReportInput =
  | { jobId: string; host: string; status: "completed"; result: unknown; model: string | null; codexAuthMode: string | null; durationMs: number | null }
  | ({ jobId: string; host: string; status: "failed"; codexAuthMode: string | null; durationMs: number | null } & Omit<FailureSignal, "codexAuthMode">);

export type ReportResult = { ok: true; status: JobStatusValue } | { ok: false; reason: "not_found" | "not_running" };

/** ポーラーからの結果を保存し、ジョブと記事の状態を進める。 */
export async function reportAnalysisResult(input: ReportInput, now = new Date()): Promise<ReportResult> {
  const job = await prisma.articleAnalysisJob.findUnique({ where: { id: input.jobId }, select: { id: true, articleId: true, status: true } });
  if (!job) return { ok: false, reason: "not_found" };
  // 期限切れで一度QUEUEDへ戻ったジョブへ、遅れて届いた結果は捨てる（次の実行が正になる）。
  if (!canAcceptReport(job.status)) return { ok: false, reason: "not_running" };

  if (input.status === "failed") {
    const classification = classifyFailure({ exitCode: input.exitCode, stderrTail: input.stderrTail, codexAuthMode: input.codexAuthMode, timedOut: input.timedOut });
    await finishJob(job.id, job.articleId, classification.status, now, { failureKind: classification.failureKind, failureMessage: classification.message });
    await recordWorkerError(input.host, classification.message, now);
    return { ok: true, status: classification.status };
  }

  const parsed = parseAnalysisPayload(input.result);
  if (!parsed.ok) {
    const message = truncateFailureMessage(`解析結果を読み取れませんでした: ${parsed.error}`);
    await finishJob(job.id, job.articleId, "FAILED", now, { failureKind: "INVALID_OUTPUT", failureMessage: message });
    return { ok: true, status: "FAILED" };
  }

  const payload = parsed.value;
  await prisma.$transaction(async (tx) => {
    await tx.articleAnalysis.create({
      data: {
        articleId: job.articleId,
        jobId: job.id,
        relevance: payload.relevance,
        confidence: payload.confidence,
        reason: payload.reason,
        noiseReason: payload.noiseReason,
        summary: payload.summary,
        fullSummary: payload.fullSummary,
        announcedOn: parseAnnouncedOn(payload.announcedOn),
        regions: payload.regions as Prisma.InputJsonValue,
        metrics: payload.metrics as Prisma.InputJsonValue,
        implications: payload.implications,
        importance: payload.importance,
        duplicates: payload.duplicates as unknown as Prisma.InputJsonValue,
        relatedFindings: payload.relatedFindings as unknown as Prisma.InputJsonValue,
        model: input.model,
        codexAuthMode: input.codexAuthMode,
        durationMs: input.durationMs,
      },
    });
    await tx.articleAnalysisJob.update({ where: { id: job.id }, data: { status: "COMPLETED", finishedAt: now, activeKey: null, leaseExpiresAt: null, failureKind: null, failureMessage: null } });

    // 対象外と判定された記事は週報の候補から外す。人が既に確定している記事はその判断を優先し、
    // AIの判定で上書きしない（`reviewedAt`が入っているものは触らない）。
    const article = await tx.industryInformation.findUnique({ where: { id: job.articleId }, select: { reviewedAt: true } });
    const autoExclude = shouldAutoExcludeFromWeekly(payload.relevance, article?.reviewedAt ?? null);
    await tx.industryInformation.update({
      where: { id: job.articleId },
      data: { analysisStatus: "COMPLETED", analyzedAt: now, ...(autoExclude ? { weeklyCandidate: false } : {}) },
    });
  });
  await prisma.analysisWorker.updateMany({ where: { host: input.host }, data: { lastSeenAt: now, lastError: null } });
  return { ok: true, status: "COMPLETED" };
}

async function finishJob(jobId: string, articleId: string, status: "FAILED" | "AUTH_REQUIRED", now: Date, failure: { failureKind: FailureKindValue; failureMessage: string }): Promise<void> {
  await prisma.$transaction([
    prisma.articleAnalysisJob.update({ where: { id: jobId }, data: { status, finishedAt: now, activeKey: null, leaseExpiresAt: null, ...failure } }),
    prisma.industryInformation.update({ where: { id: articleId }, data: { analysisStatus: status } }),
  ]);
}

async function recordWorkerError(host: string, message: string, now: Date): Promise<void> {
  await prisma.analysisWorker.updateMany({ where: { host }, data: { lastSeenAt: now, lastError: message } });
}

// --- 人による確定 ---------------------------------------------------------------------

export type ReviewInput = { articleId: string; relevance: AnalysisRelevanceValue; importance: AnalysisImportanceValue; weeklyCandidate: boolean; note: string | null; reviewedBy: string };

/**
 * 人が事業区分・重要度・週報候補への採否を確定する。
 *
 * AIの生成内容（`ArticleAnalysis`）は消さず、記事側の値だけを確定値へ置き換える。
 * `reviewedAt`が入っている記事は、以降のAI判定で週報候補の採否を書き換えない。
 * 対象外を選んだ場合、事業区分は登録時のまま残す（あとで戻せるようにするため）。
 */
export async function applyHumanReview(input: ReviewInput, now = new Date()): Promise<boolean> {
  const article = await prisma.industryInformation.findUnique({ where: { id: input.articleId }, select: { id: true } });
  if (!article) return false;
  await prisma.industryInformation.update({
    where: { id: input.articleId },
    data: {
      ...(input.relevance === "OUT_OF_SCOPE" ? {} : { business: input.relevance }),
      importance: input.importance,
      weeklyCandidate: input.relevance === "OUT_OF_SCOPE" ? false : input.weeklyCandidate,
      reviewNote: input.note,
      reviewedAt: now,
      reviewedBy: input.reviewedBy,
    },
  });
  return true;
}

/**
 * 一覧のカードから週報候補への採否だけを切り替える。
 *
 * 事業区分・重要度を選び直さずに「対象外の記事を外す／戻す」を1タップで行えるようにするための
 * 入口で、これも人の判断なので`reviewedAt`を立てる（以降AIの判定で書き換わらない）。
 */
export async function setWeeklyCandidate(articleId: string, weeklyCandidate: boolean, reviewedBy: string, now = new Date()): Promise<boolean> {
  return (await setTriageDecision([articleId], weeklyCandidate, reviewedBy, now)) > 0;
}

/**
 * 複数の記事をまとめて採用／不採用にする（#94。新着記事画面の仕分け）。
 *
 * 採用＝`weeklyCandidate: true`、不採用＝`false`で、どちらも人の判断なので`reviewedAt`を立てる。
 * 不採用は削除ではなく隠すだけ——行を消すとURLの一意制約も消え、翌日の自動収集が同じ記事を
 * 未判定として登録し直す。更新できた件数を返す（存在しないIDは数に入らない）。
 */
export async function setTriageDecision(articleIds: string[], adopt: boolean, reviewedBy: string, now = new Date()): Promise<number> {
  if (articleIds.length === 0) return 0;
  const updated = await prisma.industryInformation.updateMany({ where: { id: { in: articleIds } }, data: { weeklyCandidate: adopt, reviewedAt: now, reviewedBy } });
  return updated.count;
}

// --- 画面向けの取得 -------------------------------------------------------------------

export type AnalysisOverview = { queued: number; running: number; failed: number; authRequired: number; worker: { host: string; lastSeenAt: Date; codexAuthMode: string | null; codexVersion: string | null; lastError: string | null } | null };

/** 画面上部の実行環境ストリップに出す、キューの件数とポーラーの生存状況。 */
export async function getAnalysisOverview(): Promise<AnalysisOverview> {
  const [grouped, worker] = await Promise.all([
    prisma.articleAnalysisJob.groupBy({ by: ["status"], _count: { _all: true }, where: { status: { in: ["QUEUED", "RUNNING", "FAILED", "AUTH_REQUIRED"] } } }),
    prisma.analysisWorker.findFirst({ orderBy: { lastSeenAt: "desc" } }),
  ]);
  const count = (status: JobStatusValue) => grouped.find((row) => row.status === status)?._count._all ?? 0;
  return { queued: count("QUEUED"), running: count("RUNNING"), failed: count("FAILED"), authRequired: count("AUTH_REQUIRED"), worker };
}

/** 記事詳細画面。解析履歴は最新順で全件返す（1記事あたりの実行回数は多くならない）。 */
export async function getArticleDetail(articleId: string) {
  return prisma.industryInformation.findUnique({
    where: { id: articleId },
    include: { analyses: { orderBy: { createdAt: "desc" } }, analysisJobs: { orderBy: { queuedAt: "desc" } } },
  });
}
