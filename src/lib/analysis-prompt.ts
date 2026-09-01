/**
 * 記事AI解析（#79）のプロンプト・出力スキーマ・結果検証。
 *
 * 解析を実行するのはサブPC上のCodex CLI（ChatGPTアカウント認証）だが、**プロンプトと出力
 * スキーマはこのモジュールが唯一の正**で、`POST /api/internal/analysis/claim`の応答に載せて
 * ポーラーへ渡す。ポーラー（`scripts/codex-analysis-worker.mjs`）は受け取った文面を
 * `codex exec --output-schema` に流すだけの実行役にしてあり、観点を足すときにサブPC側の
 * スクリプトを配り直さずに済む。
 *
 * `OPENAI_API_KEY`を使う経路はこのファイルにも他のどこにも無い（Research Deskのサーバーから
 * OpenAI APIを直接呼ばない、というIssueの前提）。
 */

/** 解析の観点。宅配事業・ロッカー事業それぞれで「何を見るか」をプロンプトに埋め込む。 */
const DELIVERY_SCOPE = "宅配ボックス、郵便ポスト、機能門柱、置き配、防犯（なりすまし受け取り・盗難）、施工性、配送ロボット／ドローン配送";
const LOCKER_SCOPE = "マルチロッカー、セルフ発送機、PUDO・SMARI・Amazon Hub等の受取／発送／返品、ロッカーの運用・設置・事業性";

export type AnalysisRelevanceValue = "DELIVERY" | "LOCKER" | "OUT_OF_SCOPE";
export type AnalysisImportanceValue = "HIGH" | "MEDIUM" | "REFERENCE";

export type AnalysisDuplicate = { title: string; url: string | null; reason: string };
export type AnalysisRelatedFinding = { title: string; url: string; publishedOn: string | null; summary: string; reason: string; isPrimarySource: boolean };

/** Codexが返すJSON。`buildOutputSchema()`のJSON Schemaと1対1で対応する。 */
export type AnalysisPayload = {
  relevance: AnalysisRelevanceValue;
  confidence: number;
  reason: string;
  noiseReason: string | null;
  summary: string;
  fullSummary: string | null;
  announcedOn: string | null;
  regions: string[];
  metrics: Record<string, string>;
  implications: string | null;
  importance: AnalysisImportanceValue;
  duplicates: AnalysisDuplicate[];
  relatedFindings: AnalysisRelatedFinding[];
};

/** プロンプトへ渡す解析対象の記事。 */
export type AnalysisTargetArticle = {
  id: string;
  title: string;
  originalUrl: string;
  sourceName: string;
  publisher: string | null;
  business: "DELIVERY" | "LOCKER";
  publishedAt: Date | null;
  collectedAt: Date;
  content: string | null;
  summary: string | null;
};

/** 重複判定のために渡す、同じ週に登録済みの記事。 */
export type AnalysisPeerArticle = { title: string; originalUrl: string; business: "DELIVERY" | "LOCKER"; publishedAt: Date | null; summary: string | null };

/** 記事本文をプロンプトへ載せる上限。長い記事で1回の実行が枠を食い潰さないよう切る。 */
export const CONTENT_PROMPT_LIMIT = 8000;

function isoDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "不明";
}

/**
 * 解析プロンプトを組み立てる。
 *
 * 記事本文・原典URL・取得日・同じ週の既存記事を入力に含める。出力の形はJSON Schemaで縛るため、
 * ここでは「何を見て何を書くか」だけを指示し、キー名の列挙は繰り返さない。
 */
export function buildAnalysisPrompt(article: AnalysisTargetArticle, peers: AnalysisPeerArticle[]): string {
  const content = article.content ? article.content.slice(0, CONTENT_PROMPT_LIMIT) : null;
  const peerLines = peers.length
    ? peers.map((peer, index) => `${index + 1}. [${peer.business === "DELIVERY" ? "宅配" : "ロッカー"}] ${peer.title}（公開日 ${isoDate(peer.publishedAt)} / ${peer.originalUrl}）${peer.summary ? `\n   要約: ${peer.summary}` : ""}`).join("\n")
    : "（同じ週に登録済みの記事はありません）";

  return [
    "あなたは戸建て・集合住宅向けの宅配ボックス／機能門柱と、マルチロッカー事業を手がけるメーカーの商品企画担当を支援するリサーチャーです。",
    "以下のニュース記事を読み、指定されたJSON Schemaに合うJSONだけを最終応答として返してください。説明文・前置き・コードフェンスは付けないでください。",
    "",
    "## 判定の観点",
    "",
    `- 宅配事業（DELIVERY）: ${DELIVERY_SCOPE}`,
    `- ロッカー事業（LOCKER）: ${LOCKER_SCOPE}`,
    "- 対象外（OUT_OF_SCOPE）: 上のどちらにも実質的に関係しない記事。芸能・スポーツ・事件など、宅配やロッカーが話題の背景や小道具としてしか登場しないものは対象外にしてください。語句が一致するだけで対象に含めないこと。",
    "",
    "判定は必ず理由（reason）と信頼度（confidence, 0〜1）を伴わせてください。対象外・誤分類だと判断した場合は、そう考えた根拠を noiseReason に書いてください。",
    "",
    "## 書いてほしい内容",
    "",
    "- summary: 記事の要約（200字程度）",
    "- fullSummary: 本文が取得できている場合の全文要約（400〜600字）。本文が無い、または要約するに足る本文が取れない場合は null",
    "- announcedOn: 記事が伝えている発表日（YYYY-MM-DD）。分からなければ null",
    "- regions: 対象となる地域・国（例: 日本、首都圏、米国）",
    "- metrics: 記事中の主要な数値。キーを項目名、値を単位つきの文字列にする（例: {\"発売時期\": \"2026年10月\", \"想定価格\": \"48,000円\"}）",
    "- implications: 商品企画・全体設計への示唆。当社が何を検討すべきかという形で書く",
    "- importance: 重要度。HIGH（高）／MEDIUM（中）／REFERENCE（参考）",
    "- duplicates: 下の「同じ週に登録済みの記事」のうち、実質的に同一の発表を伝えているもの。統合すべき理由を reason に書く。無ければ空配列",
    "- relatedFindings: 記事の裏取り・周辺情報として調べた結果。**一次情報（発表元のニュースリリース・官公庁の資料・統計）を優先**し、URL・発表日・要約・関連理由を必ず付ける。確認できないURLは載せないこと。無ければ空配列",
    "",
    "## 解析対象の記事",
    "",
    `- タイトル: ${article.title}`,
    `- 原典URL: ${article.originalUrl}`,
    `- 情報源: ${article.sourceName}${article.publisher ? `（発行元 ${article.publisher}）` : ""}`,
    `- 登録時の事業区分（暫定・誤っている可能性がある）: ${article.business === "DELIVERY" ? "宅配事業" : "ロッカー事業"}`,
    `- 公開日: ${isoDate(article.publishedAt)}`,
    `- 取得日: ${isoDate(article.collectedAt)}`,
    article.summary ? `- 登録済みの要約: ${article.summary}` : "- 登録済みの要約: なし",
    "",
    content ? `### 本文（先頭${CONTENT_PROMPT_LIMIT}文字まで）\n\n${content}` : "### 本文\n\n本文は保存されていません。原典URLと上の情報から判断できる範囲で解析し、本文が要るものは null にしてください。",
    "",
    "## 同じ週に登録済みの記事（重複候補の判定に使う）",
    "",
    peerLines,
  ].join("\n");
}

/**
 * `codex exec --output-schema` へ渡すJSON Schema。
 *
 * 構造化出力は「全プロパティが required」「`additionalProperties: false`」を要求するため、
 * 省略可能な項目は`null`を許す型として表現する（`["string","null"]`）。
 */
export function buildOutputSchema(): Record<string, unknown> {
  const nullableString = { type: ["string", "null"] };
  return {
    type: "object",
    additionalProperties: false,
    required: ["relevance", "confidence", "reason", "noiseReason", "summary", "fullSummary", "announcedOn", "regions", "metrics", "implications", "importance", "duplicates", "relatedFindings"],
    properties: {
      relevance: { type: "string", enum: ["DELIVERY", "LOCKER", "OUT_OF_SCOPE"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reason: { type: "string" },
      noiseReason: nullableString,
      summary: { type: "string" },
      fullSummary: nullableString,
      announcedOn: nullableString,
      regions: { type: "array", items: { type: "string" } },
      // 項目名が記事ごとに変わるため、キーを固定しないオブジェクトとして受ける。
      metrics: { type: "object", additionalProperties: { type: "string" } },
      implications: nullableString,
      importance: { type: "string", enum: ["HIGH", "MEDIUM", "REFERENCE"] },
      duplicates: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["title", "url", "reason"], properties: { title: { type: "string" }, url: nullableString, reason: { type: "string" } } },
      },
      relatedFindings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url", "publishedOn", "summary", "reason", "isPrimarySource"],
          properties: { title: { type: "string" }, url: { type: "string" }, publishedOn: nullableString, summary: { type: "string" }, reason: { type: "string" }, isPrimarySource: { type: "boolean" } },
        },
      },
    },
  };
}

// --- 結果の検証 -----------------------------------------------------------------------
// スキーマを渡していても、モデルが枠に収まらない応答を返すこと・ポーラーが途中で切れた出力を
// 送ってくることはある。保存前にここで弾き、`INVALID_OUTPUT`として画面に出す。

export type ParseResult = { ok: true; value: AnalysisPayload } | { ok: false; error: string };

const RELEVANCE_VALUES: AnalysisRelevanceValue[] = ["DELIVERY", "LOCKER", "OUT_OF_SCOPE"];
const IMPORTANCE_VALUES: AnalysisImportanceValue[] = ["HIGH", "MEDIUM", "REFERENCE"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

/** `metrics`は項目が増える前提のため、文字列に落とせる値だけを残す。 */
function metricsRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && typeof item !== "object")
    .map(([key, item]) => [key, String(item)] as const);
  return Object.fromEntries(entries);
}

function duplicates(value: unknown): AnalysisDuplicate[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((item) => {
    const title = optionalString(item.title);
    const reason = optionalString(item.reason);
    return title && reason ? [{ title, url: optionalString(item.url), reason }] : [];
  });
}

/** 関連情報はURLが無いと裏取りに使えないため、URLの無い要素は落とす。 */
function relatedFindings(value: unknown): AnalysisRelatedFinding[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((item) => {
    const title = optionalString(item.title);
    const url = optionalString(item.url);
    if (!title || !url || !/^https?:\/\//.test(url)) return [];
    return [{ title, url, publishedOn: optionalString(item.publishedOn), summary: optionalString(item.summary) ?? "", reason: optionalString(item.reason) ?? "", isPrimarySource: item.isPrimarySource === true }];
  });
}

/**
 * Codexが返したJSONを検証して`AnalysisPayload`にする。
 *
 * 必須（relevance・confidence・reason・summary・importance）が欠けていたら保存しない。
 * それ以外は「無い」として扱い、記事1件ぶんの解析を丸ごと捨てないようにする。
 */
export function parseAnalysisPayload(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: "解析結果がオブジェクトではありません" };

  const relevance = raw.relevance;
  if (typeof relevance !== "string" || !RELEVANCE_VALUES.includes(relevance as AnalysisRelevanceValue)) {
    return { ok: false, error: `relevanceが不正です: ${String(relevance)}` };
  }
  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : null;
  if (confidence === null) return { ok: false, error: "confidenceが数値ではありません" };

  const reason = optionalString(raw.reason);
  if (!reason) return { ok: false, error: "reasonが空です" };
  const summary = optionalString(raw.summary);
  if (!summary) return { ok: false, error: "summaryが空です" };

  const importance = typeof raw.importance === "string" && IMPORTANCE_VALUES.includes(raw.importance as AnalysisImportanceValue) ? (raw.importance as AnalysisImportanceValue) : null;
  if (!importance) return { ok: false, error: `importanceが不正です: ${String(raw.importance)}` };

  return {
    ok: true,
    value: {
      relevance: relevance as AnalysisRelevanceValue,
      confidence,
      reason,
      noiseReason: optionalString(raw.noiseReason),
      summary,
      fullSummary: optionalString(raw.fullSummary),
      announcedOn: optionalString(raw.announcedOn),
      regions: stringArray(raw.regions),
      metrics: metricsRecord(raw.metrics),
      implications: optionalString(raw.implications),
      importance,
      duplicates: duplicates(raw.duplicates),
      relatedFindings: relatedFindings(raw.relatedFindings),
    },
  };
}

/** `announcedOn`（YYYY-MM-DD想定）をDateにする。解釈できない値はnullにして保存を続ける。 */
export function parseAnnouncedOn(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}
