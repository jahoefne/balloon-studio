#!/bin/bash
# Regenerates the Mac reference set (docs/plan.md, WP-V1): references/manifest.json, the Tier A
# bodies under references/files/, the probe outputs under references/probes/ and the Tier B packs
# under references/pack/ (gitignored; uploaded as assets of the GitHub release $REFS_RELEASE).
# Idempotent: a second run leaves every file as it was, except generatedAt and durationMs.
# Environment: JOBS (parallel cases, default 6), REFS_RELEASE (default refs-v1),
# FONT_FILES (space-separated --font-file specs for the text dumps, e.g. "Rounded=web/public/fonts/Nunito-Bold.ttf").
set -euo pipefail
cd "$(dirname "$0")/../.."
JOBS=${JOBS:-6}
RELEASE=${REFS_RELEASE:-refs-v1}
URL=https://github.com/jahoefne/balloon-studio/releases/download/$RELEASE
BUILD=references/build
PACK=references/pack
MAIN=balloon-studio-$RELEASE.tar.zst
LIBM=balloon-studio-$RELEASE-libm.tar.zst
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Library/Developer/CommandLineTools ]; then export DEVELOPER_DIR=/Library/Developer/CommandLineTools; fi

bash mac/scripts/build-reference-exporter.sh >/dev/null
bash mac/scripts/build-probes.sh

rm -rf "$BUILD/files" "$BUILD/entries" "$BUILD/rasters" references/files
FONT_ARGS=()
for spec in ${FONT_FILES:-}; do FONT_ARGS+=(--font-file "$spec"); done
mac/.build/reference-exporter --cases mac/cases/grid.json --out "$BUILD" --jobs "$JOBS" --rasters --tier-a references/files \
  --sources mac/Sources/BalloonStudio \
  --toolchain "swiftc=$(xcrun swiftc --version 2>&1 | head -1)" --toolchain "sdk=macosx $(xcrun --show-sdk-version)" \
  --toolchain "developerDir=$DEVELOPER_DIR" --toolchain "flags=-O -parse-as-library -swift-version 5 -target arm64-apple-macosx14.0" \
  ${FONT_ARGS[@]+"${FONT_ARGS[@]}"}

# Tier B. Archives already hold their entries, so entries/ stays local. Sorted names, one fixed
# time, root owner and no macOS metadata make the tarballs repeatable byte for byte.
mkdir -p "$PACK"
pack() { # archive, directories...
  local archive=$1 list
  shift
  list="$(pwd)/$PACK/.${archive%.tar.zst}.list"
  (cd "$BUILD" && find "$@" -type f -print0 | xargs -0 chmod 644 && find "$@" -type f -print0 | xargs -0 touch -t 202610290000.00 \
     && find "$@" -type f | LC_ALL=C sort) > "$list"
  tar --zstd --format ustar --uid 0 --gid 0 --uname root --gname wheel --no-xattrs --no-mac-metadata --no-acls --no-fflags \
      -n -cf "$PACK/$archive" -C "$BUILD" -T "$list"
  rm -f "$list"
}
pack "$MAIN" files rasters
ASSETS=(--asset "$PACK/$MAIN" "$URL/$MAIN")
if [ -d "$BUILD/probes/libm" ]; then
  pack "$LIBM" probes/libm
  ASSETS+=(--asset "$PACK/$LIBM" "$URL/$LIBM")
fi
mac/.build/reference-exporter stamp --manifest "$BUILD/manifest.json" --release "$RELEASE" "${ASSETS[@]}" --out references/manifest.json
ls -l "$PACK"
echo "references: $(find references/files -type f | wc -l | tr -d ' ') Tier A files, $(du -sh references/files | cut -f1); manifest $(du -h references/manifest.json | cut -f1)"
