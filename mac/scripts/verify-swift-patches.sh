#!/bin/bash
# Proves that the Swift patches (StableJSON and the NightFlight reference hook) change no geometry
# (docs/plan.md, WP-V1 "Patch-Beweis"). Builds the same exporter against the unchanged import
# commit and against the current sources, runs both with --geometry-only over the full grid and
# compares them: every .stl and 3D/3dmodel.model identical, every JSON equal after parsing,
# every other text entry identical. Writes references/patch-proof.json; exits 1 on a difference.
# Environment: PATCH_BASE (default cbda68d, the import), JOBS (default 6).
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$(pwd)
BASE=$(git rev-parse "${PATCH_BASE:-cbda68d}")
JOBS=${JOBS:-6}
WORK="$ROOT/mac/.build/patch-proof"
rm -rf "$WORK"
mkdir -p "$WORK"
git worktree add --detach "$WORK/pristine-tree" "$BASE" >/dev/null 2>&1
trap 'git worktree remove --force "$WORK/pristine-tree" >/dev/null 2>&1 || true' EXIT

bash mac/scripts/build-reference-exporter.sh --pristine --sources "$WORK/pristine-tree/mac/Sources/BalloonStudio" --output "$WORK/exporter-pristine" >/dev/null
bash mac/scripts/build-reference-exporter.sh --output "$WORK/exporter-patched" >/dev/null
"$WORK/exporter-pristine" --cases mac/cases/grid.json --out "$WORK/pristine" --jobs "$JOBS" --geometry-only \
  --sources "$WORK/pristine-tree/mac/Sources/BalloonStudio" 2> "$WORK/pristine.log" || true
"$WORK/exporter-patched" --cases mac/cases/grid.json --out "$WORK/patched" --jobs "$JOBS" --geometry-only \
  --sources mac/Sources/BalloonStudio 2> "$WORK/patched.log" || true
DIRTY=$(git status --porcelain -- mac/Sources | wc -l | tr -d ' ')
python3 -I mac/scripts/compare-patch-proof.py "$WORK/pristine/manifest.json" "$WORK/patched/manifest.json" \
  --base "$BASE" --head "$(git rev-parse HEAD)" --dirty "$DIRTY" --out references/patch-proof.json
