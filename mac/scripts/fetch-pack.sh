#!/bin/bash
# Fetches the Tier B reference pack listed in references/manifest.json, checks its SHA-256 and
# unpacks it to references/pack/<release>/ (files/, rasters/ and, with --libm, probes/libm/).
# A pack that make-references.sh left in references/pack/ is used as it is when its hash matches.
# Usage: fetch-pack.sh [--libm] [--dest DIR]   (Linux or macOS; needs curl or gh, tar with zstd)
set -euo pipefail
cd "$(dirname "$0")/../.."
WITH_LIBM=0
DEST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --libm) WITH_LIBM=1; shift ;;
    --dest) DEST="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
ASSETS=$(python3 -I -c '
import json, sys
pack = json.load(open("references/manifest.json")).get("pack") or {}
print(pack.get("release", ""))
for a in pack.get("assets", []):
    if sys.argv[1] == "1" or not a["name"].endswith("-libm.tar.zst"):
        print(a["name"], a["sha256"], a["url"])
' "$WITH_LIBM")
RELEASE=$(echo "$ASSETS" | head -1)
[ -n "$RELEASE" ] || { echo "references/manifest.json names no pack" >&2; exit 1; }
DEST=${DEST:-references/pack/$RELEASE}
mkdir -p references/pack "$DEST"
echo "$ASSETS" | tail -n +2 | while read -r name hash url; do
  file="references/pack/$name"
  if [ -f "$DEST/.$name.sha256" ] && [ "$(cat "$DEST/.$name.sha256")" = "$hash" ]; then echo "$name: already unpacked"; continue; fi
  if [ ! -f "$file" ] || [ "$(sha "$file")" != "$hash" ]; then
    echo "$name: downloading"
    curl -fL --retry 3 -o "$file.part" "$url" \
      || gh release download "$RELEASE" --repo jahoefne/balloon-studio --pattern "$name" --output "$file.part" --clobber
    mv "$file.part" "$file"
  fi
  actual=$(sha "$file")
  if [ "$actual" != "$hash" ]; then echo "$name: SHA-256 $actual, manifest says $hash" >&2; exit 1; fi
  tar --zstd -xf "$file" -C "$DEST"
  echo "$hash" > "$DEST/.$name.sha256"
  echo "$name: unpacked to $DEST"
done
