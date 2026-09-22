#!/usr/bin/env bash
# public/brand/*.svg（ブランドの原本）から、PWA・iOS・favicon用のPNGを作り直す（#225）。
# 原本のSVGを直したときだけ手で実行し、生成したPNGもコミットする。ビルドやCIでは実行しない。
#
# 必要なもの: rsvg-convert（Ubuntuなら `sudo apt install librsvg2-bin`）
set -euo pipefail

cd "$(dirname "$0")/../public/brand"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert が見つかりません（sudo apt install librsvg2-bin）" >&2
  exit 1
fi

render() {
  local src="$1" size="$2" out="$3"
  rsvg-convert --width "$size" --height "$size" --output "$out" "$src"
  echo "generated: public/brand/$out (${size}x${size})"
}

render icon.svg 192 icon-192.png
render icon.svg 512 icon-512.png
render icon-maskable.svg 192 icon-maskable-192.png
render icon-maskable.svg 512 icon-maskable-512.png
render apple-icon.svg 180 apple-icon-180.png
render favicon.svg 32 favicon-32.png
