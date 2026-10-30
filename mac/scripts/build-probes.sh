#!/bin/bash
# Builds and runs the Swift semantics probes (mac/Probes) and writes references/probes/.
# The complete Libm series (about 250 MB) go to references/build/probes/libm for the pack.
# Usage: build-probes.sh [--no-full]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=../references/probes
FULL=../references/build/probes/libm
if [ "${1:-}" = "--no-full" ]; then FULL=""; fi
if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Library/Developer/CommandLineTools ]; then export DEVELOPER_DIR=/Library/Developer/CommandLineTools; fi
CORE=(BalloonGeometry BalloonPatterns BalloonText NightFlight SummitCableCar ThreeMF StableJSON SurfaceQuery CeilingLoop StringHoles
      BasketGeometry RingGeometry SegmentedRing SunGeometry CloudGeometry CableSeal CableClamp LampSurface CloudLEDLayout
      LampSettingsFile FigureGeometry NailInsert CableClip STLImport)
CORE_FILES=()
for name in "${CORE[@]}"; do CORE_FILES+=("Sources/BalloonStudio/$name.swift"); done
mkdir -p .build/module-cache .build/probes "$OUT"
build() { # name, extra sources...
  local name=$1; shift
  xcrun swiftc -O -parse-as-library -swift-version 5 -module-cache-path "$(pwd)/.build/module-cache" \
    -target arm64-apple-macosx14.0 "$@" "Probes/$name/main.swift" -o ".build/probes/$name"
}
pids=()
build Libm & pids+=($!)
build Arith & pids+=($!)
build Format "${CORE_FILES[@]}" & pids+=($!)
build Json "${CORE_FILES[@]}" & pids+=($!)
build LampSurface "${CORE_FILES[@]}" & pids+=($!)
for pid in "${pids[@]}"; do wait "$pid"; done
if [ -n "$FULL" ]; then .build/probes/Libm --out "$OUT" --full "$FULL"; else .build/probes/Libm --out "$OUT"; fi
.build/probes/Arith --out "$OUT"
.build/probes/Format --out "$OUT"
# gzip -n leaves out name and time, so the archive only changes with its content.
gzip -n -9 -f "$OUT/format.tsv"
.build/probes/Json --out "$OUT"
# Fixtures of WP-K4c: Swift's own field values and sculpted fronts, kept with the web tests.
LAMP_SURFACE=../web/tests/fixtures/swift/lampSurface
.build/probes/LampSurface --out "$LAMP_SURFACE"
gzip -n -9 -f "$LAMP_SURFACE"/*.stl "$LAMP_SURFACE"/field.f64
ls -l "$OUT" "$LAMP_SURFACE"
