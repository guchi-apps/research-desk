"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ZIP_SIZE_BYTES, WIDTH_PRESETS, buildImageMailZip, type ImageMailZipResult, type WidthPreset } from "@/lib/image-mail-client";

type WidthMode = "auto" | WidthPreset;
type SendResult = { ok: true; messageId?: string } | { ok: false; message: string };

interface SelectedImage {
  id: string;
  file: File;
  previewUrl: string;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// PC/スマホ問わず同じ<input>から起動する。`capture="environment"`は対応端末でだけ
// 背面カメラを直接開き、非対応環境では通常のファイル選択にフォールバックする。
export default function ImageMailPanel() {
  const [title, setTitle] = useState("");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [widthMode, setWidthMode] = useState<WidthMode>("auto");
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildResult, setBuildResult] = useState<ImageMailZipResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  const captureInputRef = useRef<HTMLInputElement>(null);
  const pickInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      for (const image of images) URL.revokeObjectURL(image.previewUrl);
    };
  }, [images]);

  function resetOutcome() {
    setBuildResult(null);
    setBuildError(null);
    setIdempotencyKey(null);
    setSendResult(null);
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const added = Array.from(fileList).map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) }));
    setImages((current) => [...current, ...added]);
    resetOutcome();
  }

  function removeImage(id: string) {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((image) => image.id !== id);
    });
    resetOutcome();
  }

  async function handleBuild() {
    setBuilding(true);
    setBuildError(null);
    try {
      const manualWidth = widthMode === "auto" ? null : widthMode;
      const result = await buildImageMailZip(images.map((image) => image.file), manualWidth);
      setBuildResult(result);
      setIdempotencyKey(crypto.randomUUID());
      setSendResult(null);
    } catch (error) {
      setBuildResult(null);
      setBuildError(error instanceof Error ? error.message : "ZIPの作成に失敗しました");
    } finally {
      setBuilding(false);
    }
  }

  async function handleSend() {
    if (!buildResult || !idempotencyKey) return;
    setSending(true);
    setSendResult(null);
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("imageCount", String(images.length));
      form.set("width", String(buildResult.width));
      form.set("idempotencyKey", idempotencyKey);
      form.set("zip", new Blob([new Uint8Array(buildResult.zip)], { type: "application/zip" }), "images.zip");

      const response = await fetch("/api/image-mail/send", { method: "POST", body: form });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "送信に失敗しました";
        setSendResult({ ok: false, message });
        return;
      }
      const messageId = body && typeof body === "object" && "messageId" in body && typeof body.messageId === "string" ? body.messageId : undefined;
      setSendResult({ ok: true, messageId });
    } catch {
      setSendResult({ ok: false, message: "通信に失敗しました。しばらくしてから再試行してください" });
    } finally {
      setSending(false);
    }
  }

  const zipTooLarge = buildResult !== null && buildResult.zip.byteLength > MAX_ZIP_SIZE_BYTES;
  const canBuild = !building && images.length > 0 && title.trim().length > 0;
  const canSend = !sending && buildResult !== null && !zipTooLarge;

  return (
    <div className="imgmail-card">
      <div className="imgmail-block">
        <div className="imgmail-block-head"><h2>写真タイトル</h2></div>
        <input
          className="imgmail-title-input"
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            resetOutcome();
          }}
          placeholder="例）〇〇現場 定例点検"
          maxLength={200}
        />
      </div>

      <div className="imgmail-block">
        <div className="imgmail-block-head"><h2>写真</h2><span>{images.length}枚選択中</span></div>
        <div className="imgmail-add">
          <button type="button" className="cta" onClick={() => captureInputRef.current?.click()}>📷　写真を撮る</button>
          <button type="button" className="cta ghost" onClick={() => pickInputRef.current?.click()}>🖼　写真を追加</button>
        </div>
        <input ref={captureInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
        <input ref={pickInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
        {images.length > 0 && (
          <div className="imgmail-thumbs">
            {images.map((image) => (
              <div key={image.id} className="thumb" style={{ backgroundImage: `url(${image.previewUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}>
                <button type="button" aria-label={`${image.file.name}を削除`} onClick={() => removeImage(image.id)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="imgmail-block">
        <div className="imgmail-block-head"><h2>横幅</h2><span>2MBを超えると自動で下げます</span></div>
        <div className="segmented">
          <button type="button" className={widthMode === "auto" ? "active" : ""} onClick={() => { setWidthMode("auto"); resetOutcome(); }}>自動<small>1200→900→600</small></button>
          {WIDTH_PRESETS.map((preset) => (
            <button key={preset} type="button" className={widthMode === preset ? "active" : ""} onClick={() => { setWidthMode(preset); resetOutcome(); }}>{preset}px</button>
          ))}
        </div>
      </div>

      <button type="button" className="cta full big" disabled={!canBuild} onClick={handleBuild}>{building ? "作成中…" : "ZIPを作成する"}</button>

      {buildError && <p className="helper" style={{ color: "#b8541c" }}>{buildError}</p>}

      {buildResult && (
        <div className="result-card">
          <div className="result-grid">
            <div><small>画像数</small><p>{images.length}枚</p></div>
            <div><small>最終横幅</small><p>{buildResult.width}px</p></div>
            <div><small>ZIPサイズ</small><p>{formatBytes(buildResult.zip.byteLength)}</p></div>
          </div>
          {buildResult.autoDowngraded && <div className="result-note">ℹ️　2MBを超えたため、{buildResult.width}pxへ自動で縮小しました。</div>}
          <div className="subject-row"><span className="subject-fixed">[画像]</span><span className="subject-title">{title.trim() || "（タイトル未入力）"}</span></div>
          <p className="dest-note">宛先・BCCは設定済みの社用アドレス固定です（画面から変更はできません）。</p>
        </div>
      )}

      {zipTooLarge && <p className="helper" style={{ color: "#b8541c" }}>600pxまで下げても2MBを超えています。画像の枚数を減らしてから再度お試しください。</p>}

      <button type="button" className="cta full big" disabled={!canSend} onClick={handleSend}>{sending ? "送信中…" : "この内容で送信する"}</button>

      {sendResult && (
        sendResult.ok ? (
          <div className="success-banner">
            <div className="dot">✓</div>
            <div>
              <p>送信しました。Gmailで受信を確認してください。</p>
              {sendResult.messageId && <small>messageId: {sendResult.messageId}</small>}
            </div>
          </div>
        ) : (
          <div className="success-banner" style={{ background: "#fdece0", borderColor: "#f0c39a" }}>
            <div className="dot" style={{ background: "#b8541c" }}>!</div>
            <div><p style={{ color: "#8a3a12" }}>{sendResult.message}</p></div>
          </div>
        )
      )}

      <p className="helper">600pxでも2MBを超える場合は送信できません。画像を減らしてお試しください。</p>
    </div>
  );
}
