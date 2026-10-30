# Raster fixtures

CoreGraphics/CoreText dumps from the Mac app that the deterministic rasterizer (`web/src/core/raster`,
`text`, `artwork`) is compared against. The rasterizer is checked by **tolerance** against these files
(docs/plan.md §7, "Verifikation (R)"); byte-identity across browsers is a separate hash test (see "Hashes").

This file is the contract between the Swift reference exporter (`mac/ReferenceExporter`, `--rasters`) and the raster
tests. Tests read everything through `tests/support/rasterFixtures.ts`.

## Where each set is

The relief and text dumps are 67 MB raw, too much for the repository, so they stay in the reference pack and are not
copied here. `deploy.yml` has no pack, so tests of pack data skip themselves on CI and run locally.

| Set | Where | Read with |
| --- | --- | --- |
| Relief: Night Flight and Summit Cable Car × classic, round, tall (6 cases) | Pack: `rasters/relief-*.{raw.pgm,field.f32,json}` | `loadReliefDump(id)` |
| Text: 5 fonts × `F`, `Hello`, `O`, `Zoë & Léa <3`, plus `東京` in Rounded (21 cases) | Pack: `rasters/text-*.{pgm,json}` | `loadTextDump(id)` |
| Primitives: 14 calibration canvases, `index.json` with their commands | Tier A: `references/files`, through `references/manifest.json` | `loadPrimitive(name)`, `loadPrimitiveIndex()` |
| What WP-R2 measured beyond the primitives | Here: `primitives/probes/cg-raster.txt.gz`, source `cg-raster.swift` | `fixtureText`, `probeSection` |
| SHA-256 of the TS rasters | Here: `hashes.json` | `tests/hashes.test.ts` |

`<id>` is the case id from `mac/cases/grid.json` (group `relief` or `text`); the file names are in the `rasters` field of
each case in `references/manifest.json`.

- **relief**: `<id>.raw.pgm` is the artwork bitmap before the /255 (CGContext bytes), `<id>.field.f32` the height field
  after the blur (`NightFlightRelief.smooth` twice), `<id>.json` holds `width, height, columns, rows, bottom, depth, diameter,
  crest[rows]`, the blur radii, `style` and the hashes.
- **text**: `<id>.pgm` is the CoreText mask with antialiasing off (0 or 255), `<id>.json` holds `width, height, aspect,
  bounds, glyphCount`, the runs (font, glyph ids, positions), the text and the font source. `bounds` is
  `CGPath.boundingBoxOfPath`, the tight curve bound **without** control points: port it with `Path.pathBounds()`, not
  `controlBounds()` (measured; see `web/src/core/raster/path.ts`).
  **refs-v1 has the Apple fonts** (`fontSource: "system:…"`), so these masks document what the Mac shapes and rasterizes.
  The comparison material for the TS text rasterizer comes from the rerun after WP-R3, which loads the bundled TTFs
  (`web/public/fonts`, `CTFontManagerCreateFontDescriptorFromData` → `CTFontCreateWithFontDescriptor(·, 100)`, so only shaping
  and rasterization differ); see `references/PACK.md`. The loader reads whatever the manifest then names.
- **primitives**: circle, AA-off triangle, miter polyline, round caps, dash, rounded-rect stroke, radial and linear
  gradient with clips, nested clips, moon path (NightFlight.swift:84-93), stroked and dashed copies, a circle drawn twice.
  Measured: gradients are stepped and dithered, the aliased rule is "every touched pixel"
  (`web/src/core/raster/{gradient,scanline}.ts`).
- **probes**: coverage of fractional edges, unions inside one pixel, the aliased pixel rule, circles and free curves, the
  gradient table size, the 16×16 gradient dither tile and its anchor, nested clips.

## Formats

- **PGM**: binary P5, maxval 255, header `P5\n<width> <height>\n255\n`, one byte per pixel. File row 0 is
  memory row 0 of the CGContext, which the Swift code flips so that **row 0 is the bottom** of the artwork or
  glyphs. Read with `decodePGM` (`web/src/core/raster/pgm.ts`); never flip.
- **`.field.f32`**: raw little-endian Float32, `columns × rows`, row 0 at the bottom, no header. Read with
  `decodeFloat32LE(bytes, columns * rows)`.
- **`.gz`**: gzip written with `gzip -9 -n` (no file name, no timestamp) so regenerating unchanged data gives
  identical bytes. `fixtureBytes` decompresses by the name; test code only, never `src/core`.
- Relief artwork in the TS core is `Float(byte)/255` (`fieldFromBytes` in `web/src/core/patterns/raster.ts`).

## Loaders

`web/tests/support/rasterFixtures.ts`, Node only. Whatever comes from the pack or Tier A is checked against the manifest's
SHA-256 and throws when damaged. `REFS_PACK_DIR` picks the pack, as in `web/harness`; the default is
`references/pack/refs-v1` at the repo root.

```ts
import { float32BitDifference, hasRasterPack, loadPrimitive, loadReliefDump, loadTextDump, rasterCaseIds } from './support/rasterFixtures';

for (const id of rasterCaseIds('relief')) {
  it.skipIf(!hasRasterPack())(id, () => {
    const { meta, raw, field } = loadReliefDump(id);  // meta.crest[row], raw.pixels, field: Float32Array
    expect(float32BitDifference(smooth(raw.pixels, meta), field)).toBeNull();  // Float32 arrays, bit for bit
  });
}
const { meta, mask } = loadTextDump('text-rounded-f');  // needs the skipIf too
const moon = loadPrimitive('moon-r24');                 // Tier A, no pack: { width, height, pixels }
```

| Call | Gives |
| --- | --- |
| `hasRasterPack()`, `rasterPackDir()` | Whether the dumps are there; their directory |
| `rasterCaseIds(group?)` | Case ids with dumps, optionally only `relief` or `text` |
| `loadReliefDump(id)` | `{ meta, raw, field }`; about 11 MB, so load once per test file |
| `loadTextDump(id)` | `{ meta, mask }` |
| `primitiveNames()`, `loadPrimitive(name)`, `loadPrimitiveIndex()` | The canvases from Tier A |
| `fixtureBytes(rel)`, `fixtureText(rel)`, `fixturePGM(rel)`, `fixtureFloat32(rel, count?)` | Files under `tests/fixtures`, gunzipped if `.gz` |
| `probeSection(text, name)`, `probeValue(text, name)` | Parts of a probe dump |
| `decodePGM`, `decodeFloat32LE`, `float32BitDifference`, `rasterHash` | Bytes to values, comparisons |

The pure parts are in `web/src/core/testing/raster.ts` (`decodeFloat32LE`, `float32BitDifference`, `rasterHash`), without
`node:`, for code that also runs in a browser.

## Hashes

`hashes.json` maps `primitive/<name>`, `scene/worst-case-3072x1200` and later `artwork/<id>` to the SHA-256 of the bytes the TS
core draws. `tests/hashes.test.ts` draws every one again, in Node under `npm test` and in the browsers under
`npm run test:browser`. It also fails when a key has no drawing or a drawing has no key.

To add a raster or take over an intended change:

1. Add a line to `RASTER_SCENES` in `tests/support/rasterScenes.ts`. That module must stay free of Node APIs and of the pack:
   anything a drawing needs (a crest array, say) comes as an import of core code or a bundled file.
2. Run `UPDATE_RASTER_HASHES=1 npx vitest run tests/hashes.update.test.ts`, which rewrites `hashes.json` from the table.
   Check the diff: an unintended change shows as a changed line. The same variable on `src/core/raster/primitives.test.ts`
   rewrites the file with its own keys only, so do not use that one.
3. Run `npm run test:browser`.

### Browser run

```bash
npx playwright install chromium firefox webkit   # once, and after a Playwright update
npm run test:browser
```

`web/vitest.browser.config.ts` runs only `tests/hashes.test.ts`, headless, in the three engines. The test logs one digest per
engine (`raster hash digest …`; add `-- --reporter=verbose` to see it); it covers all hashes, so equal digests mean equal rasters.
CI runs this as job `browser-hashes` in `deploy.yml`, after `build`, with `~/.cache/ms-playwright` cached on the lockfile. The
deploy does not wait for it; a failure turns the run red.

## Provenance

A new row is needed whenever the Swift sources, the fonts or macOS change. The pack rows are release `refs-v1`
(`references/manifest.json`: `generatedAt` 2026-10-29T22:43:23Z, `sourcesSha256` `5c0599851f44…`, toolchain and flags in
`generator`). CoreGraphics draws one case at a time there, since it is not deterministic across threads (`references/PACK.md`).

| Set | Swift sources (`mac/` commit) | macOS | Swift | Produced by | Date |
| --- | --- | --- | --- | --- | --- |
| Relief, text, primitives | `04553ee` (app), `41a2ab1` (exporter) | 26.6.2 (25G83) | 6.3.3 | `bash mac/scripts/make-references.sh` (`--rasters`, `JOBS=6`) | 2026-10-29 |
| `primitives/probes/cg-raster.txt.gz` | none (stand-alone probe `primitives/probes/cg-raster.swift`, comments there) | 26.6.2 (25G83) | 6.3.3 | `cg-raster \| gzip -9 -n` | 2026-10-30 |
| `hashes.json` | none: TS rasters, checked against the dumps by tolerance in `raster/primitives.test.ts` | any | none | `UPDATE_RASTER_HASHES=1 npx vitest run tests/hashes.update.test.ts` | 2026-10-30 |

Identical hashes measured for `hashes.json` on 2026-10-30, macOS 26.6.2: Node 26, Chromium 156.0.8078.4, Firefox 157.0,
WebKit 27.2 (Playwright 1.64.1).

For reference, the CoreGraphics path semantics frozen in `path.ts` (WP-R0) were measured on macOS 26.6.2
(25G83) with Swift 6.3.3 against the `mac/` sources imported in `cbda68d`. The arc, stroke and dash semantics of
`path.ts`, `stroke.ts` and `dash.ts` (WP-R1) were measured on the same system with
`swift/probes/cg-arcs.swift` (output `swift/cg-arcs.jsonl`) and `swift/probes/cg-stroke-dash.swift`.

## Metrics and thresholds

Implemented in `web/tests/support/compare.ts` (`THRESHOLDS`). Pixel values in bytes (0…255).

| Comparison | Metric | Threshold |
| --- | --- | --- |
| Artwork raster vs `<id>.raw.pgm` | `pixelAgreement(ts, cg, 2)` | ≥ 0.97 |
| | `pixelAgreement(ts, cg, 16)` | ≥ 0.995 |
| | `blockMeanDifference(ts, cg, w, h, 8)` | ≤ 8 |
| Height field vs `<id>.field.f32` (× 2.4 mm) | `heightfieldStats(ts, cg, 2.4)` | rms ≤ 0.03 mm, p99.9 ≤ 0.15 mm, max ≤ 0.4 mm |
| Blur + SAT fed with the Swift `.raw.pgm` | bitwise vs `.field.f32` (`float32BitDifference`) | identical (tolerance 0) |
| Text mask vs `text-*.pgm` | width/height | ±1 px |
| | aspect | ±1 % |
| | `iou(ts, cg)` (nearest-neighbour resampled to the CG size) | ≥ 0.97 |
| Primitives vs `loadPrimitive(name)` | `pixelAgreement(ts, cg, 2)` | ≥ 0.98 (`cubic-dash-8-5-w4` ≥ 0.97: dash drift on curves, see `dash.ts`) |
| Moon primitive (checks the `addArc` normalisation) | ink at the moon circle's centre, which lies in the bite | 0 |
| Worst-case scene (3072 × 1200, 700 primitives) | time in Node | < 0.6 s, hard only with `PERF=1`; otherwise a warning from 3 s |
| Determinism | `hashes.json` in Node, Chromium, Firefox, WebKit | identical |

The plan gives the primitives threshold without a tolerance; ±2 gray levels (the fine artwork tolerance) is
assumed here.
