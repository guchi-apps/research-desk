import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideWeeklyCap, getTriageState, isHigherPriority, parseTriageParam, parseTriageRequest, MAX_TRIAGE_IDS } from "./triage.ts";

const at = new Date("2026-09-01T00:00:00Z");

describe("getTriageState", () => {
  it("人が判断していない記事は未判定、AIが外したものは確認待ちになる", () => {
    assert.equal(getTriageState({ weeklyCandidate: true, reviewedAt: null }), "pending");
    assert.equal(getTriageState({ weeklyCandidate: false, reviewedAt: null }), "ai_rejected");
  });
  it("人が判断した記事は候補に残っているかで採用・不採用に分かれる", () => {
    assert.equal(getTriageState({ weeklyCandidate: true, reviewedAt: at }), "adopted");
    assert.equal(getTriageState({ weeklyCandidate: false, reviewedAt: at }), "rejected");
  });
});

describe("parseTriageParam", () => {
  it("既知の値だけを通し、それ以外は未判定にする", () => {
    assert.equal(parseTriageParam("adopted"), "adopted");
    assert.equal(parseTriageParam("all"), "all");
    assert.equal(parseTriageParam(undefined), "pending");
    assert.equal(parseTriageParam("deleted"), "pending");
    assert.equal(parseTriageParam(["adopted"]), "pending");
  });
});

describe("parseTriageRequest", () => {
  it("記事IDの重複をまとめ、判断の種類を検証する", () => {
    assert.deepEqual(parseTriageRequest({ articleIds: ["a", "b", "a", " "], decision: "reject" }), { articleIds: ["a", "b"], decision: "reject" });
    assert.equal(parseTriageRequest({ articleIds: ["a"], decision: "delete" }), null);
    assert.equal(parseTriageRequest({ articleIds: [], decision: "adopt" }), null);
    assert.equal(parseTriageRequest({ articleIds: "a", decision: "adopt" }), null);
    assert.equal(parseTriageRequest(null), null);
  });
  it("上限を超える件数は受け付けない", () => {
    const articleIds = Array.from({ length: MAX_TRIAGE_IDS + 1 }, (_, index) => `id-${index}`);
    assert.equal(parseTriageRequest({ articleIds, decision: "adopt" }), null);
    assert.equal(parseTriageRequest({ articleIds: articleIds.slice(0, MAX_TRIAGE_IDS), decision: "adopt" })?.articleIds.length, MAX_TRIAGE_IDS);
  });
});

describe("isHigherPriority", () => {
  it("重要度→一次情報→公開日時の順で比べる", () => {
    assert.equal(isHigherPriority({ importance: "HIGH", isPrimarySource: false, publishedAt: null }, { importance: "MEDIUM", isPrimarySource: true, publishedAt: at }), true);
    assert.equal(isHigherPriority({ importance: "MEDIUM", isPrimarySource: true, publishedAt: null }, { importance: "MEDIUM", isPrimarySource: false, publishedAt: at }), true);
    assert.equal(isHigherPriority({ importance: "MEDIUM", isPrimarySource: false, publishedAt: new Date("2026-09-02T00:00:00Z") }, { importance: "MEDIUM", isPrimarySource: false, publishedAt: at }), true);
    assert.equal(isHigherPriority({ importance: "REFERENCE", isPrimarySource: true, publishedAt: at }, { importance: "MEDIUM", isPrimarySource: false, publishedAt: null }), false);
  });
});

type Peer = { id: string; importance: "HIGH" | "MEDIUM" | "REFERENCE"; isPrimarySource: boolean; publishedAt: Date | null; weeklyCandidate: boolean; reviewedAt: Date | null };
const peer = (id: string, importance: Peer["importance"], overrides: Partial<Peer> = {}): Peer => ({ id, importance, isPrimarySource: false, publishedAt: at, weeklyCandidate: true, reviewedAt: null, ...overrides });
const candidate = { importance: "HIGH" as const, isPrimarySource: false, publishedAt: at };

describe("decideWeeklyCap", () => {
  it("上限に達していなければそのまま追加する", () => {
    assert.deepEqual(decideWeeklyCap([peer("a", "REFERENCE")], candidate, 2), { action: "insert" });
  });
  it("不採用の記事は上限に数えない", () => {
    const peers = [peer("a", "HIGH"), peer("b", "HIGH", { weeklyCandidate: false, reviewedAt: at }), peer("c", "HIGH", { weeklyCandidate: false })];
    assert.deepEqual(decideWeeklyCap(peers, candidate, 2), { action: "insert" });
  });
  it("上限到達時は未判定のうち最も弱い記事を置き換える", () => {
    const peers = [peer("strong", "HIGH"), peer("weak", "REFERENCE")];
    const decision = decideWeeklyCap(peers, candidate, 2);
    assert.equal(decision.action, "replace");
    assert.equal(decision.action === "replace" ? decision.target.id : null, "weak");
  });
  it("人が採用した記事は最も弱くても置き換えない", () => {
    const peers = [peer("kept", "REFERENCE", { reviewedAt: at }), peer("mid", "MEDIUM")];
    const decision = decideWeeklyCap(peers, candidate, 2);
    assert.equal(decision.action, "replace");
    assert.equal(decision.action === "replace" ? decision.target.id : null, "mid");
  });
  it("置き換えてよい記事が無い、または候補が弱ければ除外する", () => {
    assert.deepEqual(decideWeeklyCap([peer("a", "REFERENCE", { reviewedAt: at }), peer("b", "REFERENCE", { reviewedAt: at })], candidate, 2), { action: "exclude" });
    assert.deepEqual(decideWeeklyCap([peer("a", "HIGH"), peer("b", "HIGH")], { ...candidate, importance: "MEDIUM" }, 2), { action: "exclude" });
  });
});
