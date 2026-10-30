# Raster fixtures

CoreGraphics/CoreText dumps from the Mac app that the deterministic rasterizer (`web/src/core/raster`,
`text`, `artwork`) is compared against. The rasterizer is checked by **tolerance** against these files
(docs/plan.md §7, "Verifikation (R)"); byte-identity across browsers is a separate hash test.

The Swift reference exporter (`mac/ReferenceExporter`, WP-V1, `--rasters`) writes them; WP-R6 compresses
and commits them here. Nothing is committed yet.

## Layout

```
web/tests/fixtures/
├── README.md
├── text/<id>.pgm.gz            CoreText mask, antialiasing off (0 or 255)
├── text/<id>.json              {width, height, aspect, bounds, glyphCount}
├── relief/<id>.raw.pgm.gz      artwork bitmap before the /255 (CGContext bytes)
├── relief/<id>.field.f32.gz    height field after the blur (NightFlightRelief `smooth` twice)
├── relief/<id>.json            {width, height, columns, rows, bottom, depth, diameter, crest: [rows]}
├── primitives/<name>.pgm.gz    64×64 calibration canvases
└── hashes.json                 SHA-256 of the TS rasters (WP-R6; must match in Node, Chromium, Firefox, WebKit)
```

`<id>` is the case id from `mac/cases/grid.json` (group `relief` or `text`).

- **relief**: Night Flight and Summit Cable Car on the classic, round and tall envelopes (6 cases).
- **text**: the bundled TTFs (`web/public/fonts`, loaded on the Mac with
  `CTFontManagerCreateFontDescriptorFromData` → `CTFontCreateWithFontDescriptor(·, 100)`, so only shaping and
  rasterization are compared) × `F`, `Hello`, `O`, `Zoë & Léa <3` = 20 cases (+ `東京` if R8 lands).
  `bounds` is `CGPath.boundingBoxOfPath`, the tight curve bound **without** control points — port it with
  `Path.pathBounds()`, not `controlBounds()` (measured; see `web/src/core/raster/path.ts`).
- **primitives**: circle, AA-off triangle, miter polyline, round caps, dash, rounded-rect stroke,
  radial and linear gradient with clips, nested clips, moon path (NightFlight.swift:84-93).

## Formats

- **PGM**: binary P5, maxval 255, header `P5\n<width> <height>\n255\n`, one byte per pixel. File row 0 is
  memory row 0 of the CGContext, which the Swift code flips so that **row 0 is the bottom** of the artwork or
  glyphs. Read with `decodePGM` (`web/src/core/raster/pgm.ts`); never flip.
- **`.field.f32`**: raw little-endian Float32, `columns × rows`, row 0 at the bottom, no header. Read with
  `decodeFloat32LE(bytes, columns * rows)`.
- **`.gz`**: gzip written with `gzip -9 -n` (no file name, no timestamp) so regenerating unchanged data gives
  identical bytes. Tests decompress with `node:zlib` (`gunzipSync`) — test code only, never `src/core`.
- Relief artwork in the TS core is `Float(byte)/255` (`fieldFromBytes` in `web/src/core/patterns/raster.ts`).

## Provenance

Each fixture set records where it came from. WP-R6 fills this table when it commits fixtures; a new row is
needed whenever the Swift sources, the fonts or macOS change.

| Set | Swift sources (`mac/` commit) | macOS | Swift | Exporter command | Date |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | not generated yet |

For reference, the CoreGraphics path semantics frozen in `path.ts` (WP-R0) were measured on macOS 26.6.2
(25G83) with Swift 6.3.3 against the `mac/` sources imported in `cbda68d`. The arc, stroke and dash semantics of
`path.ts`, `stroke.ts` and `dash.ts` (WP-R1) were measured on the same system with
`swift/probes/cg-arcs.swift` (output `swift/cg-arcs.jsonl`) and `swift/probes/cg-stroke-dash.swift`.

## Metrics and thresholds

Implemented in `web/tests/support/compare.ts` (`THRESHOLDS`). Pixel values in bytes (0…255).

| Comparison | Metric | Threshold |
| --- | --- | --- |
| Artwork raster vs `relief/*.raw.pgm` | `pixelAgreement(ts, cg, 2)` | ≥ 0.97 |
| | `pixelAgreement(ts, cg, 16)` | ≥ 0.995 |
| | `blockMeanDifference(ts, cg, w, h, 8)` | ≤ 8 |
| Height field vs `relief/*.field.f32` (× 2.4 mm) | `heightfieldStats(ts, cg, 2.4)` | rms ≤ 0.03 mm, p99.9 ≤ 0.15 mm, max ≤ 0.4 mm |
| Blur + SAT fed with the Swift `.raw.pgm` | bitwise vs `.field.f32` | identical (tolerance 0) |
| Text mask vs `text/*.pgm` | width/height | ±1 px |
| | aspect | ±1 % |
| | `iou(ts, cg)` (nearest-neighbour resampled to the CG size) | ≥ 0.97 |
| Primitives vs `primitives/*.pgm` | `pixelAgreement(ts, cg, 2)` | ≥ 0.98 |
| Moon primitive (checks the `addArc` normalisation) | ink at the moon circle's centre, which lies in the bite | 0 |
| Determinism | `hashes.json` in Node, Chromium, Firefox, WebKit | identical |

The plan gives the primitives threshold without a tolerance; ±2 gray levels (the fine artwork tolerance) is
assumed here.
