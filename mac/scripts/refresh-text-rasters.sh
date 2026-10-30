#!/bin/bash
# Adds the text dumps with the bundled fonts (WP-R3) without the full make-references.sh run: draws the text
# cases one at a time, merges their `rasters` lists into references/manifest.json (nothing else in it changes, and
# mergeRasters refuses if the Apple dumps or the 3MFs came out differently) and copies the new <id>.ttf.* files into
# the unpacked pack. The release pack holds them only after the next make-references.sh with FONT_FILES.
set -euo pipefail
cd "$(dirname "$0")/../.."
FONTS=web/public/fonts
BUILD=references/build/text-rasters
PACK=${REFS_PACK_DIR:-references/pack/refs-v1}
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Library/Developer/CommandLineTools ]; then export DEVELOPER_DIR=/Library/Developer/CommandLineTools; fi

IDS=$(python3 -I -c 'import json; print(",".join(c["id"] for c in json.load(open("mac/cases/grid.json"))["cases"] if c.get("group") == "text" and c.get("rasters")))')

bash mac/scripts/build-reference-exporter.sh >/dev/null
rm -rf "$BUILD"
mac/.build/reference-exporter --cases mac/cases/grid.json --out "$BUILD" --only "$IDS" --jobs 1 --rasters --tier-a references/files \
  --font-file "rounded=$FONTS/Nunito-Bold.ttf" --font-file "sans=$FONTS/Arimo-Bold.ttf" --font-file "serif=$FONTS/Gelasio-Bold.ttf" \
  --font-file "handwritten=$FONTS/ComicNeue-Bold.ttf" --font-file "mono=$FONTS/DejaVuSansMono-Bold.ttf"
mac/.build/reference-exporter merge-rasters --manifest references/manifest.json --from "$BUILD/manifest.json"
cp "$BUILD"/rasters/text-*.ttf.* "$PACK/rasters/"
echo "text dumps: $(ls "$BUILD"/rasters/text-*.ttf.pgm | wc -l | tr -d ' ') masks in $PACK/rasters"
