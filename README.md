# Balloon Studio

Parametric hot-air balloon envelopes, baskets, mobile rings, hanging figures, cloud and sun wall lamps and a cable clip for 3D printing, with live 3D previews and print-ready exports (binary STL, two-colour Bambu 3MF, ZIP kits with assembly notes and LED templates). All dimensions are in millimetres; the designs are made for the Bambu Lab P2S.

Balloon Studio is becoming a web app: **https://jahoefne.github.io/balloon-studio/** (under construction). The original native Mac app lives in [`mac/`](mac/) and stays the reference implementation while the TypeScript port is verified against it file for file.

## Status

Milestones M0 to M3 are done: the web app at the link above runs every part on the ported core, with the Mac app's seven tabs, stores and persistence, the Three.js preview, and export and open flows that write the same files (binary STL, two-colour 3MF, ZIP kits). Each part is verified against the Mac exports file for file: the full reference grid of 158 cases passes with no mismatch (byte-identical, or vertices within one Float32 ULP; the three libm cases that change a mesh within measured bounds are listed in `docs/plan.md` §14/§15). The text and relief patterns use bundled open fonts and a deterministic rasterizer checked against CoreGraphics dumps and across browser engines. The 3MFs the web core writes pass the Mac app's unchanged `mac/scripts/verify-3mf.py`. Left: the acceptance report and the second reference pack; see [`docs/plan.md`](docs/plan.md) (German) for the work packages, the identity criterion for exported files and the milestones.

## Fonts in the web app

The Mac app letters the Text pattern with Apple's system fonts, which a web page cannot ship. The web app keeps the five font names in the picker and in saved settings and bundles open fonts behind them: Rounded is Nunito Bold, Sans serif is Arimo Bold, Serif is Gelasio Bold, Handwritten is Comic Neue Bold and Monospaced is DejaVu Sans Mono Bold (`web/public/fonts/`, licenses in `LICENSES.md` there). Letters therefore look a little different from the Mac app's, and `fi`, `fl` and `ffi` are not set as ligatures. A character the chosen font lacks comes from one of the other four. A character none of them has, such as CJK or emoji, is left out, and the editor names it under the text field.

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
npm run e2e        # Playwright smoke: every tab in Chromium, Firefox, WebKit (stub core)
npm run e2e:parity # walks docs/parity-checklist.md on both cores and regenerates it
npm run export-pattern-tests # writes web/.build/pattern-tests/*.3mf and runs mac/scripts/verify-3mf.py on them
npm run bench:patterns       # raster, preview and export times of the Text and relief patterns
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
