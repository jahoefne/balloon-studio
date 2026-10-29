#!/bin/bash
# Builds the headless reference exporter from the 23 core files (+ StableJSON.swift where present).
# Usage: build-reference-exporter.sh [--sources DIR] [--pristine] [--output FILE]
#   --sources   core sources to compile (default Sources/BalloonStudio)
#   --pristine  the unpatched import: no StableJSON, no raster dumps (verify-swift-patches.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
SOURCES=Sources/BalloonStudio
OUTPUT=.build/reference-exporter
DEFINES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --sources) SOURCES="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    --pristine) DEFINES=(-D PRISTINE_SOURCES); shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
# The Xcode license is not accepted on this Mac; the command line tools build the same binaries.
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Library/Developer/CommandLineTools ]; then export DEVELOPER_DIR=/Library/Developer/CommandLineTools; fi
CORE=(BalloonGeometry BalloonPatterns BalloonText NightFlight SummitCableCar ThreeMF SurfaceQuery CeilingLoop StringHoles
      BasketGeometry RingGeometry SegmentedRing SunGeometry CloudGeometry CableSeal CableClamp LampSurface CloudLEDLayout
      LampSettingsFile FigureGeometry NailInsert CableClip STLImport)
FILES=()
for name in "${CORE[@]}"; do FILES+=("$SOURCES/$name.swift"); done
if [ -f "$SOURCES/StableJSON.swift" ]; then FILES+=("$SOURCES/StableJSON.swift"); fi
mkdir -p .build/module-cache "$(dirname "$OUTPUT")"
# Same flags as build-app.sh, so the exporter computes exactly what the app computes.
xcrun swiftc -O -parse-as-library -swift-version 5 \
  -module-cache-path "$(pwd)/.build/module-cache" \
  -target arm64-apple-macosx14.0 \
  ${DEFINES[@]+"${DEFINES[@]}"} \
  "${FILES[@]}" ReferenceExporter/main.swift \
  -o "$OUTPUT"
echo "$OUTPUT"
