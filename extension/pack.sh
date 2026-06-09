#!/usr/bin/env bash
# Chrome 웹 스토어 제출용 zip 생성
# 사용: bash extension/pack.sh  → staysync-extension.zip 생성
set -e
cd "$(dirname "$0")"
OUT="../staysync-extension.zip"
rm -f "$OUT"

# 포함할 파일만 명시 (manifest가 zip 최상위에 오도록 폴더 안에서 압축)
zip -r "$OUT" \
  manifest.json \
  background.js \
  platforms.js \
  content-token.js \
  content-reservations.js \
  popup.html \
  popup.css \
  popup.js \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png \
  -x "*.DS_Store"

echo "✅ 생성됨: $(cd .. && pwd)/staysync-extension.zip"
unzip -l "$OUT" | tail -n +2
