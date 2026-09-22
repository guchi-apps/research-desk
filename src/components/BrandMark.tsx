// ワークリレーのブランドマーク（#225）。記事・写真・メモを表す2枚のカードを、ティールのリレーラインで
// つなぐ。オレンジの点は拾い上げた重要情報（起点）。図形の原本は`public/brand/*.svg`にあり、
// ここはそれと同じ座標をインラインで描く（色を背景に合わせて切り替えるため、<img>では置かない）。
//
// SVGが描けない環境でも「ワークリレー」と分かるよう、外側に`role="img"`と`aria-label`を付ける。

const NAVY = "#1D3440";
const TEAL = "#087F78";
const ORANGE = "#D97735";
const PAPER = "#F7FAF8";
const MINT = "#70D6BF";

const RELAY_PATH = "M150 321 C198 321 212 291 241 273 C271 254 304 252 345 252";
const RELAY_ARROW = "M336 220 L386 252 L336 284 Z";

/** 明るい背景に置く通常版（紺のタイル＋白いカード＋ティールの流線）。PWAアイコンと同じ見た目。 */
function TileLight() {
  return (
    <>
      <rect width="512" height="512" rx="112" fill={NAVY} />
      <rect x="82" y="105" width="210" height="270" rx="34" fill={PAPER} />
      <circle cx="126" cy="153" r="15" fill={ORANGE} />
      <rect x="153" y="141" width="91" height="24" rx="12" fill="#CFE0DD" />
      <rect x="116" y="205" width="128" height="18" rx="9" fill="#9DC9C2" />
      <rect x="116" y="240" width="94" height="18" rx="9" fill="#CFE0DD" />
      <rect x="220" y="137" width="210" height="270" rx="34" fill={PAPER} stroke={NAVY} strokeWidth="12" paintOrder="stroke" />
      <rect x="258" y="184" width="128" height="28" rx="14" fill={TEAL} />
      <rect x="258" y="239" width="128" height="18" rx="9" fill="#9DC9C2" />
      <rect x="258" y="274" width="94" height="18" rx="9" fill="#CFE0DD" />
      <path d={RELAY_PATH} fill="none" stroke={TEAL} strokeWidth="34" strokeLinecap="round" />
      <path d={RELAY_ARROW} fill={TEAL} />
      <circle cx="150" cy="321" r="13" fill={ORANGE} />
    </>
  );
}

/** 濃色背景に置く版（白いタイル＋紺のカード＋ミントの流線）。`logo-horizontal-dark.svg`と同じ見た目。 */
function TileDark() {
  return (
    <>
      <rect width="512" height="512" rx="112" fill={PAPER} />
      <rect x="82" y="105" width="210" height="270" rx="34" fill={NAVY} />
      <circle cx="126" cy="153" r="15" fill={ORANGE} />
      <rect x="220" y="137" width="210" height="270" rx="34" fill={NAVY} stroke={PAPER} strokeWidth="12" paintOrder="stroke" />
      <path d={RELAY_PATH} fill="none" stroke={MINT} strokeWidth="34" strokeLinecap="round" />
      <path d={RELAY_ARROW} fill={MINT} />
      <circle cx="150" cy="321" r="13" fill={ORANGE} />
    </>
  );
}

/** 32px前後向けの簡略版（カード内の本文の線を省く）。`favicon.svg`と同じ見た目。 */
function Simple() {
  return (
    <>
      <rect width="64" height="64" rx="14" fill={NAVY} />
      <rect x="8" y="13" width="28" height="33" rx="5" fill={PAPER} />
      <rect x="26" y="19" width="30" height="33" rx="5" fill={PAPER} stroke={NAVY} strokeWidth="3" paintOrder="stroke" />
      <path d="M15 39 C22 39 24 33 30 31 C34 30 38 30 42 30" fill="none" stroke={TEAL} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M41 23.5 L51 30 L41 36.5 Z" fill={TEAL} />
      <circle cx="15" cy="39" r="4" fill={ORANGE} />
    </>
  );
}

/**
 * タイルを持たない版。紺の背景（スプラッシュ）へ直接置く。左のカード→右のカード→流線の順に
 * 明るさが移るフェードは`globals.css`の`.relay-*`が担う。
 */
function Bare() {
  return (
    <>
      <g className="relay-a">
        <rect x="82" y="105" width="210" height="270" rx="34" fill={PAPER} />
        <circle cx="126" cy="153" r="15" fill={ORANGE} />
      </g>
      <g className="relay-b">
        <rect x="220" y="137" width="210" height="270" rx="34" fill={PAPER} stroke={NAVY} strokeWidth="12" paintOrder="stroke" />
      </g>
      <g className="relay-l">
        <path d={RELAY_PATH} fill="none" stroke={MINT} strokeWidth="34" strokeLinecap="round" />
        <path d={RELAY_ARROW} fill={MINT} />
      </g>
      <circle cx="150" cy="321" r="13" fill={ORANGE} />
    </>
  );
}

type Variant = "light" | "dark" | "simple" | "bare";

const VIEW_BOX: Record<Variant, string> = {
  light: "0 0 512 512",
  dark: "0 0 512 512",
  simple: "0 0 64 64",
  // カード2枚の外接矩形（82〜430 × 105〜407）に余白を足した範囲
  bare: "72 90 372 332",
};

export function BrandMark({ variant, size, className, decorative = false }: { variant: Variant; size: number; className?: string; decorative?: boolean }) {
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "ワークリレー" };
  return (
    <svg className={className} width={size} height={size} viewBox={VIEW_BOX[variant]} xmlns="http://www.w3.org/2000/svg" {...a11y}>
      {variant === "light" && <TileLight />}
      {variant === "dark" && <TileDark />}
      {variant === "simple" && <Simple />}
      {variant === "bare" && <Bare />}
    </svg>
  );
}

/** `work·relay`のワードマーク。`tone`は置く背景の明るさ（dark = 濃色背景用でrelayがミント）。 */
export function Wordmark({ tone, className }: { tone: "light" | "dark"; className?: string }) {
  return (
    <span className={`wordmark ${tone}${className ? ` ${className}` : ""}`}>
      work<span className="dot">·</span>
      <span className="relay">relay</span>
    </span>
  );
}

/** 横長ロゴ（マーク＋ワードマーク）。サイドバー（濃色）とスマホ上部バー（明色）で使う。 */
export function BrandLogo({ tone, className }: { tone: "light" | "dark"; className?: string }) {
  return (
    <span className={`brand-logo ${tone}${className ? ` ${className}` : ""}`} role="img" aria-label="ワークリレー（work·relay）">
      <BrandMark variant={tone === "dark" ? "dark" : "simple"} size={tone === "dark" ? 38 : 30} decorative />
      <Wordmark tone={tone} />
    </span>
  );
}
