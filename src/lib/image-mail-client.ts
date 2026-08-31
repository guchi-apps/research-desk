// ブラウザ内で完結する画像圧縮・ZIP化（#64）。元画像・圧縮画像・ZIPはResearch Deskの
// DBやサーバーディスクへ永続保存しない方針のため、ここで作った結果はメモリ上でのみ扱い、
// 呼び出し元がAIDEへの送信リクエストへそのまま載せる。

export const WIDTH_PRESETS = [1200, 900, 600] as const;
export type WidthPreset = (typeof WIDTH_PRESETS)[number];

export const MAX_ZIP_SIZE_BYTES = 2 * 1024 * 1024;

const JPEG_QUALITY = 0.82;

export interface ImageMailZipResult {
  zip: Uint8Array;
  width: WidthPreset;
  autoDowngraded: boolean;
}

async function resizeImageToJpeg(file: File, maxWidth: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像の描画コンテキストを取得できませんでした");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error(`${file.name}の圧縮に失敗しました`);
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

async function buildZip(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  const { zip } = await import("fflate");
  return new Promise((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

/**
 * 横幅を手動指定した場合はその横幅だけでZIPを作る（2MBを超えても自動では下げない）。
 * 自動（`manualWidth`未指定）の場合は1200→900→600pxの順に作り直し、2MB以下になった時点、
 * または600pxに達した時点で止める。
 */
export async function buildImageMailZip(files: File[], manualWidth: WidthPreset | null): Promise<ImageMailZipResult> {
  if (files.length === 0) throw new Error("画像を1枚以上選択してください");
  const widths = manualWidth ? [manualWidth] : WIDTH_PRESETS;

  let result: { zip: Uint8Array; width: WidthPreset } | null = null;
  for (const width of widths) {
    const entries: Record<string, Uint8Array> = {};
    for (const [index, file] of files.entries()) {
      entries[`${String(index + 1).padStart(2, "0")}.jpg`] = await resizeImageToJpeg(file, width);
    }
    const zipData = await buildZip(entries);
    result = { zip: zipData, width };
    if (manualWidth || zipData.byteLength <= MAX_ZIP_SIZE_BYTES) break;
  }

  if (!result) throw new Error("ZIPの作成に失敗しました");
  return { zip: result.zip, width: result.width, autoDowngraded: !manualWidth && result.width !== WIDTH_PRESETS[0] };
}
