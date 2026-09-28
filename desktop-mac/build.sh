#!/bin/bash
# Build JD.app (AppKit + WebKit, no dependencies): ./build.sh → ~/Desktop/JD.app
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-$HOME/Desktop}/JD.app"
rm -rf build "$OUT"; mkdir -p build/JD.app/Contents/{MacOS,Resources}
swiftc -O -target arm64-apple-macos12.0 -framework AppKit -framework WebKit -framework CoreLocation -o build/JD.app/Contents/MacOS/JD JDOne/main.swift
cp JDOne/Info.plist build/JD.app/Contents/Info.plist
# icon from the JD logo PNG (512px) → .icns
if [ -f icon-512.png ]; then
  rm -rf build/JD.iconset; mkdir -p build/JD.iconset
  for s in 16 32 64 128 256 512; do sips -z $s $s icon-512.png --out build/JD.iconset/icon_${s}x${s}.png >/dev/null; done
  for s in 16 32 128 256; do cp build/JD.iconset/icon_$((s*2))x$((s*2)).png build/JD.iconset/icon_${s}x${s}@2x.png; done
  cp icon-512.png build/JD.iconset/icon_512x512@2x.png
  iconutil -c icns build/JD.iconset -o build/JD.app/Contents/Resources/JD.icns
fi
codesign --force --deep --sign - build/JD.app
cp -R build/JD.app "$OUT"
echo "Built $OUT"
