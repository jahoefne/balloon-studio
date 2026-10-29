# Architecture (overview)

The authoritative plan is `docs/plan.md` (German). This page is the short English map.

- **`web/src/core`** — pure TypeScript port of the Swift geometry/export core, one file per Swift file, no DOM or Node APIs, deterministic math through `core/swift/dmath.ts`. Exposes `CoreApi` (`core/api.ts`), implemented by `core/real` and stubbed by `core/stub`.
- **`web/src/worker`** — one worker script, two instances: `preview` (debounced, latest wins) and `io` (exports, STL import, settings decoding). Messages are typed in `protocol.ts`; mesh buffers and export bytes are transferred.
- **`web/src/{app,ui,stores,editors,preview,io,persistence}`** — React shell mirroring the Mac app: header with part switcher, 312 px sidebar per part, preview column (Three.js port of the SceneKit scene), export/open dialogs, `localStorage` under the Mac app's `UserDefaults` keys.
- **`mac/`** — the Swift app, unchanged apart from `StableJSON.swift` (sorted JSON keys), plus `ReferenceExporter/` and `Probes/` that produce `references/`.
- **`references/`** — `manifest.json` with SHA-256 per exported file and ZIP entry, small files inline (Tier A), the full pack as a release asset (Tier B). `web/harness` compares web output against it: byte-identical, or ≤ 1 Float32 ULP with identical topology for STL; byte-identical JSON/text/SVG; numerically identical 3MF coordinates.
