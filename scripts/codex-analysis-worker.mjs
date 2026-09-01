#!/usr/bin/env node
/**
 * 記事AI解析の常駐ポーラー（#79）。サブPCで動かす。
 *
 * Research Deskの `POST /api/internal/analysis/claim` からジョブを取り、ChatGPTアカウントで
 * ログイン済みの Codex CLI（`codex exec`）へ流し、結果を `.../report` へ返すだけの実行役。
 * **解析の観点・出力スキーマ・失敗の分類はすべてResearch Desk側が持つ**ので、プロンプトを
 * 変えてもこのスクリプトを配り直す必要はない。
 *
 * ChatGPTの契約枠を使うため、`OPENAI_API_KEY`は子プロセスの環境から必ず取り除く
 * （残っているとCodexがAPIキー認証へ切り替わり、従量課金で回り続けてしまう）。
 *
 * 設定は環境変数で渡す（サブPCでは systemd user unit の EnvironmentFile を想定）。
 *
 *   RESEARCH_DESK_URL              例: https://research-desk.gucchii.com
 *   ANALYSIS_WORKER_SECRET         Research Desk側の同名の環境変数と同じ値
 *   ANALYSIS_WORKER_HOST           既定はホスト名
 *   ANALYSIS_POLL_INTERVAL_SECONDS 既定 60
 *   ANALYSIS_MAX_JOBS              1回のclaimで取る件数。既定 1
 *   ANALYSIS_JOB_TIMEOUT_SECONDS   1件あたりの実行上限。既定 600
 *   CODEX_BIN                      既定 codex
 *   CODEX_MODEL                    省略可。指定するとcodexへ -m で渡す
 *
 * ログには記事本文・原典URL・プロンプト・シークレットを一切出さない（ジョブIDと状態だけ）。
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";

const BASE_URL = (process.env.RESEARCH_DESK_URL ?? "").replace(/\/+$/, "");
const SECRET = process.env.ANALYSIS_WORKER_SECRET ?? "";
const HOST = process.env.ANALYSIS_WORKER_HOST ?? hostname();
const POLL_INTERVAL_MS = Number(process.env.ANALYSIS_POLL_INTERVAL_SECONDS ?? 60) * 1000;
const MAX_JOBS = Number(process.env.ANALYSIS_MAX_JOBS ?? 1);
const JOB_TIMEOUT_MS = Number(process.env.ANALYSIS_JOB_TIMEOUT_SECONDS ?? 600) * 1000;
const CODEX_BIN = process.env.CODEX_BIN ?? "codex";
const CODEX_MODEL = process.env.CODEX_MODEL ?? "";

/** サーバーへ送る標準エラーの末尾の長さ。失敗の分類に足りるぶんだけ。 */
const STDERR_TAIL = 600;

function log(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

function requireConfig() {
  const missing = [];
  if (!BASE_URL) missing.push("RESEARCH_DESK_URL");
  if (!SECRET) missing.push("ANALYSIS_WORKER_SECRET");
  if (missing.length > 0) {
    process.stderr.write(`設定が足りません: ${missing.join(", ")}\n`);
    process.exit(1);
  }
}

async function api(path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    // 本文にはシークレットも記事本文も含まれないが、長さは切ってログを汚さないようにする。
    throw new Error(`${path} が ${response.status} を返しました: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Codexの認証方式を`~/.codex/auth.json`から読む。
 *
 * `codex login status`の文言に頼らず、`auth_mode`をそのまま返す（`chatgpt`以外だと
 * Research Desk側が`auth_required`として扱い、APIキー認証で回り続けるのを止める）。
 */
async function readCodexAuthMode() {
  const codexHome = process.env.CODEX_HOME ?? join(process.env.HOME ?? "", ".codex");
  try {
    const parsed = JSON.parse(await readFile(join(codexHome, "auth.json"), "utf8"));
    if (typeof parsed.OPENAI_API_KEY === "string" && parsed.OPENAI_API_KEY !== "") return "api_key";
    return typeof parsed.auth_mode === "string" ? parsed.auth_mode : "unknown";
  } catch {
    return "not_logged_in";
  }
}

async function readCodexVersion() {
  return new Promise((resolve) => {
    const child = spawn(CODEX_BIN, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.on("error", () => resolve(null));
    child.on("close", () => resolve(out.trim() || null));
  });
}

/**
 * 1件のジョブをCodexで実行する。
 *
 * `--output-schema`で最終応答の形を縛り、`-o`でその応答だけをファイルへ書かせる
 * （標準出力を解析すると、進捗表示が混ざったときに壊れるため）。
 */
async function runCodex(job, workDir) {
  const schemaPath = join(workDir, "schema.json");
  const outputPath = join(workDir, "result.json");
  await writeFile(schemaPath, JSON.stringify(job.outputSchema), "utf8");

  const args = [
    "exec",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--color", "never",
    // 関連情報の追加調査（一次情報の裏取り）にWeb検索を使う。`codex exec`は`--search`を
    // 受け付けないため、設定の上書きで有効にする。
    "-c", "tools.web_search=true",
    "--output-schema", schemaPath,
    "-o", outputPath,
    "-C", workDir,
  ];
  if (CODEX_MODEL) args.push("-m", CODEX_MODEL);
  // プロンプトは引数ではなく標準入力から渡す。記事本文がプロセス一覧（ps）に出ないようにするため。
  args.push("-");

  // ChatGPTの契約枠だけを使う。APIキーが環境に残っていてもCodexへ渡さない。
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;

  return new Promise((resolve) => {
    const child = spawn(CODEX_BIN, args, { env, cwd: workDir, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, JOB_TIMEOUT_MS);

    // 標準出力は最終応答と同じ内容を含むため保持しない（ログにも残さない）。
    child.stdout.on("data", () => {});
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-STDERR_TAIL); });
    child.on("error", (error) => { clearTimeout(timer); resolve({ exitCode: null, stderr: String(error.message).slice(-STDERR_TAIL), timedOut }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ exitCode: code, stderr, timedOut, outputPath }); });

    child.stdin.end(job.prompt);
  });
}

async function handleJob(job, codexAuthMode) {
  const startedAt = Date.now();
  const workDir = await mkdtemp(join(tmpdir(), "research-desk-analysis-"));
  try {
    const run = await runCodex(job, workDir);
    const durationMs = Date.now() - startedAt;

    if (run.exitCode !== 0 || run.timedOut) {
      log(`job ${job.jobId}: 失敗（終了コード ${run.exitCode ?? "なし"}${run.timedOut ? " / 時間切れ" : ""}）`);
      await api("/api/internal/analysis/report", { jobId: job.jobId, host: HOST, status: "failed", exitCode: run.exitCode, stderrTail: run.stderr, timedOut: run.timedOut, codexAuthMode, durationMs });
      return;
    }

    let result;
    try {
      result = JSON.parse(await readFile(run.outputPath, "utf8"));
    } catch (error) {
      log(`job ${job.jobId}: 出力を読み取れませんでした`);
      await api("/api/internal/analysis/report", { jobId: job.jobId, host: HOST, status: "failed", exitCode: 0, stderrTail: `最終応答をJSONとして読めませんでした: ${String(error.message).slice(0, 200)}`, codexAuthMode, durationMs });
      return;
    }

    const reported = await api("/api/internal/analysis/report", { jobId: job.jobId, host: HOST, status: "completed", result, model: CODEX_MODEL || null, codexAuthMode, durationMs });
    log(`job ${job.jobId}: 完了（${reported.status ?? "?"}・${Math.round(durationMs / 1000)}秒）`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function tick(codexVersion) {
  const codexAuthMode = await readCodexAuthMode();
  const { jobs } = await api("/api/internal/analysis/claim", { host: HOST, maxJobs: MAX_JOBS, codexAuthMode, codexVersion });
  if (!Array.isArray(jobs) || jobs.length === 0) return;
  log(`${jobs.length}件のジョブを取得しました（認証方式 ${codexAuthMode}）`);
  for (const job of jobs) {
    await handleJob(job, codexAuthMode);
  }
}

async function main() {
  requireConfig();
  const codexVersion = await readCodexVersion();
  log(`ポーラーを開始します（host=${HOST} / codex=${codexVersion ?? "不明"} / 間隔${POLL_INTERVAL_MS / 1000}秒）`);

  let running = true;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => { running = false; log(`${signal}を受け取りました。現在のジョブを終えてから停止します。`); });
  }

  while (running) {
    try {
      await tick(codexVersion);
    } catch (error) {
      // 1回の失敗で常駐を止めない（Research Deskの再起動・一時的な通信断で落ちないようにする）。
      log(`ポーリングに失敗しました: ${String(error.message).slice(0, 300)}`);
    }
    if (!running) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  log("停止しました。");
}

main();
