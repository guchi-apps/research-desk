import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTextMail, buildTextMailHtml, buildTextMailSubject, MAX_SUBJECT_BODY_LENGTH, MAX_TEXT_LENGTH, parseTextMailRequest, sanitizeSubjectBody } from "./text-mail.ts";

describe("sanitizeSubjectBody", () => {
  it("改行・制御文字を空白にし、連続する空白を1つにまとめる", () => {
    assert.equal(sanitizeSubjectBody("会議室\n変更\tのお知らせ"), "会議室 変更 のお知らせ");
  });

  it("前後の空白を取り除く", () => {
    assert.equal(sanitizeSubjectBody("  タイトル  "), "タイトル");
  });
});

describe("buildTextMailSubject", () => {
  it("固定接頭辞と本文をスペースでつなぐ", () => {
    assert.equal(buildTextMailSubject("会議室Bに変更"), "[メモ] 会議室Bに変更");
  });

  it("本文が空なら接頭辞だけを返す", () => {
    assert.equal(buildTextMailSubject(""), "[メモ]");
  });
});

describe("buildTextMailHtml", () => {
  it("HTMLへ差し込む値をエスケープし、改行を<br>にする", () => {
    const html = buildTextMailHtml("<script>alert(1)</script>\n次の行");
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;<br>次の行/);
    assert.doesNotMatch(html, /<script>/);
  });
});

describe("buildTextMail", () => {
  it("件名・HTML・テキストをまとめて返す", () => {
    const mail = buildTextMail({ subjectBody: "共有された文章", text: "本文です" });
    assert.equal(mail.subject, "[メモ] 共有された文章");
    assert.equal(mail.text, "本文です");
    assert.match(mail.html, /本文です/);
  });
});

describe("parseTextMailRequest", () => {
  const valid = { text: "本文", subjectBody: "件名", idempotencyKey: "key-1" };

  it("妥当なリクエストを受け付ける", () => {
    assert.deepEqual(parseTextMailRequest(valid), { text: "本文", subjectBody: "件名", idempotencyKey: "key-1" });
  });

  it("textが空ならnull", () => {
    assert.equal(parseTextMailRequest({ ...valid, text: "  " }), null);
  });

  it("textが上限を超えていればnull", () => {
    assert.equal(parseTextMailRequest({ ...valid, text: "a".repeat(MAX_TEXT_LENGTH + 1) }), null);
  });

  it("subjectBodyが空ならnull", () => {
    assert.equal(parseTextMailRequest({ ...valid, subjectBody: "   " }), null);
  });

  it("subjectBodyが上限を超えていればnull", () => {
    assert.equal(parseTextMailRequest({ ...valid, subjectBody: "a".repeat(MAX_SUBJECT_BODY_LENGTH + 1) }), null);
  });

  it("idempotencyKeyが無ければnull", () => {
    assert.equal(parseTextMailRequest({ ...valid, idempotencyKey: "" }), null);
  });

  it("オブジェクトでなければnull", () => {
    assert.equal(parseTextMailRequest("not an object"), null);
    assert.equal(parseTextMailRequest(null), null);
  });
});
