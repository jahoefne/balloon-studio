# Balloon Studio

Parametric hot-air balloon envelopes, baskets, mobile rings, hanging figures, cloud and sun wall lamps and a cable clip for 3D printing, with live 3D previews and print-ready exports (binary STL, two-colour Bambu 3MF, ZIP kits with assembly notes and LED templates). All dimensions are in millimetres; the designs are made for the Bambu Lab P2S.

Balloon Studio is becoming a web app: **https://jahoefne.github.io/balloon-studio/** (under construction). The original native Mac app lives in [`mac/`](mac/) and stays the reference implementation while the TypeScript port is verified against it file for file.

## Status

Milestone M0 (repository, build and deployment pipeline) and the first wave of work packages are done: the Swift-compatibility primitives and writers of the core (`web/src/core/swift`, `geometry`, `io`, `testing`), the rasterizer conventions (`core/raster`), the UI primitives (`web/src/ui`), the core contract with worker client and stub core (`core/types.ts`, `core/api.ts`, `web/src/worker`, `core/stub`) and the Mac reference set (`mac/ReferenceExporter`, `references/`). The editors, 3D preview and exports arrive part by part; see [`docs/plan.md`](docs/plan.md) (German) for the work packages, the identity criterion for exported files and the milestones.

## Repository layout

| Path | Contents |
| --- | --- |
| `web/` | Vite + React + Three.js app deployed to GitHub Pages; `web/src/core` is the pure TypeScript port of the geometry and export core |
| `mac/` | the Swift macOS app (`Sources/`, `Tests/`, `scripts/`), the Blender origin of the balloon (`blender/`) and, later, the headless reference exporter |
| `references/` | manifest and small reference files exported by the Mac app; the full reference pack is a release asset |
| `docs/` | plan, architecture notes, parity checklists, the Mac app's documentation (`docs/mac-app.md`) |

## Develop

```sh
cd web
npm ci
npm run dev        # http://localhost:5173/balloon-studio/
npm test           # vitest
npm run build      # typecheck + production build into web/dist
npm run size       # gzip budget check
```

Pushes to `main` run the tests, build the site and deploy it to GitHub Pages (`.github/workflows/deploy.yml`).

## The Mac app

```sh
cd mac
DEVELOPER_DIR=/Library/Developer/CommandLineTools bash scripts/build-app.sh   # dist/Balloon Studio.app
DEVELOPER_DIR=/Library/Developer/CommandLineTools bash scripts/test.sh        # geometry test suites
```

Its full documentation, including every part's dimensions, printing notes and test suites, is in [`docs/mac-app.md`](docs/mac-app.md).

## License

MIT, see [`LICENSE`](LICENSE). Bundled third-party packages and fonts keep their own licenses (`web/THIRD_PARTY_NOTICES.md`).
