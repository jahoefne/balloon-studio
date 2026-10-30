# Reference pack

The Mac app is the oracle for the web port (docs/plan.md, WP-V1). `mac/ReferenceExporter` decodes every case of `mac/cases/grid.json` with the app's own `JSONDecoder` path, normalizes it like the app's model does and calls exactly the export the app calls (`BalloonSTL.export` / `PaintedBalloon.make(…).threeMF`, `BasketGenerator…binarySTL()`, `SegmentedRingKit.archive()` or `RingGenerator…binarySTL()`, `CloudKit(…, quality:).archive()`, `FigureGenerator…binarySTL()` / `FigureSet.archive`, `CableClipKit.generate(…).printView.binarySTL()`).

| Where | What | In git |
| --- | --- | --- |
| `references/manifest.json` | One record per case: `id, part, quality, group, filename, kind, bytes, sha256, tierA, durationMs, normalized` (+ `normalizedPattern`, `normalizedPurge` for patterns); per STL `triangles`, `bbox` and `header` (hex, only when it is not the plain Balloon Studio header, i.e. the `BSTL0002` settings header); per ZIP/3MF entry `name, kind, bytes, sha256, crc32, localHeaderOffset, tierA` (+ STL facts); `rasters` for dumped cases; `error` for a case whose export throws (expected only for `basket-partial-settings`); `notes` (clip problems). Head: `generatedAt`, `generator` (toolchain, macOS, options), `grid` (SHA-256), `sources`/`sourcesSha256` (the 23 core files + `StableJSON.swift`), `tierA`, `pack` (release, asset URLs and SHA-256), `primitives`. | yes |
| `references/files/<sha256[0:2]>/<sha256>` | Tier A: every output and every ZIP/3MF entry of at most 300,000 bytes, plus the primitive canvases, content-addressed and deduplicated. Enough to prove byte identity of the clips, ring kits' small parts, seals, clamps, inserts and every kit text/SVG/JSON without the pack. | yes |
| `balloon-studio-refs-v2.tar.zst` (release `refs-v2`) | Tier B: `files/<id>/<filename>` for every case (STL, ZIP, 3MF) and `rasters/` (below). ZIP and 3MF entries are not stored separately: they are the stored entries of the archives at `localHeaderOffset`. | release asset |
| `balloon-studio-refs-v2-libm.tar.zst` (release `refs-v2`) | `probes/libm/<series>.bin`: all 1,000,000 records of each Libm probe series (see `probes/README.md`). | release asset |
| `references/probes/` | Probe outputs, see `probes/README.md`. | yes |
| `references/patch-proof.json` | Result of `mac/scripts/verify-swift-patches.sh`. | yes |

## Using the pack

```bash
bash mac/scripts/fetch-pack.sh          # main pack → references/pack/refs-v2/{files,rasters}
bash mac/scripts/fetch-pack.sh --libm   # also references/pack/refs-v2/probes/libm
```

The script reads release, URLs and SHA-256 from `references/manifest.json`, reuses a pack that `make-references.sh` left in `references/pack/`, downloads otherwise (`curl`, falling back to `gh release download`), verifies the hash and unpacks. CI can cache `references/pack/refs-v2` keyed on the asset SHA-256 in the manifest. On the Mac that generated the references the same tree is in `references/build/` (plus `entries/<id>/<entry>` for every archive).

## Raster dumps

Written with `--rasters` for cases with `"rasters": true` (group `relief` or `text`), under `rasters/`:

- **Relief** (`relief-*`): `<id>.raw.pgm`, the 8-bit CoreGraphics bitmap that `NightFlightArtwork.draw` or `SummitCableCarArtwork.draw` filled, before the `/255` (binary PGM `P5`, width `columns`, height `rows`, maxval 255). Rows are written in memory order: **the first row in the file is storage row 0, the bottom of the artwork** (lowest z), so an image viewer shows it upside down. `<id>.field.f32`: the height field after the two box blurs, little-endian Float32, same order. `<id>.json`: `width, height, columns, rows, bottom, depth, diameter, crest[rows]`, the blur radii, `style` and the hashes. The exporter reads `crest` and the field from the `NightFlightRelief` the app builds, redraws the artwork with the same arguments (the cable car with the same crest radius closure), maps every value back to its byte and re-blurs it with a copy of `smooth`; the result must equal the relief's field bit for bit (`blurVerified`).
- **Text** (`text-*`): `<id>.pgm` (`P5`, 0/255, first row = bottom of the glyphs) and `<id>.json` with `width, height, aspect, bounds, glyphCount`, the CoreText runs (font, glyph ids, positions), the normalized text and the font source. The mask comes from a copy of `BalloonTextMask.init` with the typeface passed in; with the system fonts the exporter checks it against `BalloonTextMask` itself.
- **Primitives** (`rasters/primitives/*.pgm` + `index.json`): 64 × 64 DeviceGray calibration canvases for WP-R2, black background, flipped like the artworks (storage row 0 = y 0), one unit = one pixel: filled circle r = 20 gray 0.7, triangle without antialiasing, miter polyline width 6, round-cap/round-join polyline, dashed cubic `[8, 5]` width 4, rounded-rect stroke width 2, radial gradient 0.9 → 0.6 with `drawsAfterEndLocation` in a circle clip, radial gradient under an anisotropic CTM (as `SummitCableCar.rounded`), linear gradient with both extend flags in a rectangle clip, two nested antialiased clips, the moon path of NightFlight.swift:84-93 at r = 24, a filled `copy(strokingWithWidth:)` outline, a dashed-then-stroked copy (SummitCableCar.swift:213) and a circle drawn twice. `index.json` gives every command and number.

### Two text dumps per case

`<id>.pgm` is always the app's own mask with the Apple fonts, the one the 3MF export of that case used; `fileRaster`-style mesh proofs (WP-K3) need it. With `--font-file`, the exporter also writes `<id>.ttf.pgm` and `<id>.ttf.json`, the same text through CoreText and CoreGraphics with the bundled TTF (`fontSource: "file:…"`), so that WP-R3 compares only shaping and rasterization. `--font-file <Font>=<ttf>` loads the file with `CTFontManagerCreateFontDescriptorFromData` → `CTFontCreateWithFontDescriptor(·, 100)`; `<Font>` is the raw value or the case name (`rounded`, `sans`, `serif`, `handwritten`, `mono`); a bare `--font-file <ttf>` applies to every font. File names in `FONT_FILES` must not contain spaces.

`refs-v2` holds both dumps for all 22 text cases. `mac/scripts/refresh-text-rasters.sh` redraws only the text cases one at a time, merges their `rasters` lists into the manifest with `reference-exporter merge-rasters` (which refuses if anything else of a case changed) and copies the `.ttf` files into `references/pack/refs-v2/rasters/`; right after a full run it leaves the manifest byte for byte as it was. The 20 comparison dumps of WP-R3 and the masks' hashes are also committed in `web/tests/fixtures/text/`. **Every pack has to be built with the fonts**, or the manifest loses the entries and `web/tests/textReference.test.ts` fails:

```bash
FONT_FILES="rounded=web/public/fonts/Nunito-Bold.ttf sans=web/public/fonts/Arimo-Bold.ttf serif=web/public/fonts/Gelasio-Bold.ttf handwritten=web/public/fonts/ComicNeue-Bold.ttf mono=web/public/fonts/DejaVuSansMono-Bold.ttf" \
  bash mac/scripts/make-references.sh
```

## Regenerating

```bash
FONT_FILES="…" bash mac/scripts/make-references.sh     # the list above; JOBS=6 by default; REFS_RELEASE=refs-v2
gh release create refs-v2 references/pack/balloon-studio-refs-v2.tar.zst references/pack/balloon-studio-refs-v2-libm.tar.zst \
  --repo jahoefne/balloon-studio --target <40-digit SHA or branch> --notes "Reference pack v2 (Mac exports)"
```

`make-references.sh` builds the exporter (same flags as `build-app.sh`) and the probes, clears `references/build/{files,entries,rasters}` and `references/files/`, runs the grid with `--rasters --tier-a references/files`, packs `files/` and `rasters/` (and `probes/libm/`) with `tar --zstd` (ustar, names sorted with `LC_ALL=C`, every file mode 644 and time 2026-10-29 00:00, owner root/wheel, no extended attributes or macOS metadata) and stamps release, URLs and hashes into the manifest. A second run gives identical files except `generatedAt` and the `durationMs` values. A new pack needs a new release tag (`REFS_RELEASE=refs-v2`), since the manifest pins the asset hashes.

Results depend on the macOS version: CoreText and CoreGraphics produce the raster and text masks, Apple libm the geometry. The manifest records the toolchain and OS.

## Figures for refs-v2

Generated 2026-10-30 on macOS 26.6.2 (Apple silicon, 18 cores), Swift 6.3.3 with the command line tools, `JOBS=6`.

| | |
| --- | --- |
| Cases | 158 (99 export, 59 preview quality): balloon 21, pattern 41 (10 identity, 9 relief, 22 text, incl. 5 migrations), basket 11, ring 14, cloud 29, sun 12, figure 9, figure set 2, clip 19 |
| Raw outputs | 2.12 GB in `files/` (patterns 1.41 GB: a relief 3MF is 85–198 MB even at preview quality; balloons 239 MB, suns 149 MB, clouds 144 MB, baskets 96 MB, figures 70 MB, rings 13 MB, clips 0.7 MB), 75 MB rasters; `entries/` (1.6 GB) stays local |
| Tier B | `balloon-studio-refs-v2.tar.zst` 335.7 MB, `balloon-studio-refs-v2-libm.tar.zst` 214.2 MB (SHA-256 in the manifest) |
| Tier A | 277 files, 6.1 MB; manifest 452 KB; probes 4.5 MB |
| Run time | `make-references.sh` 90–110 s in all (builds about 50 s, probes about 20 s, the grid 30 s with the CoreGraphics cases one at a time, packing about 15 s); `verify-swift-patches.sh` about 2 min |
| Longest cases | `balloon-hanger-small` 3.9 s, `relief-summit-round` 3.4 s, `cloud-sculpted-billow-min` 3.0 s, `relief-night-flight-round` 2.9 s |

## What changed from refs-v1

Only dumps were added: the bundled-font text dumps (`<id>.ttf.*`, WP-R3) are now in the pack, and the four migration cases `relief-night-flight-legacy`, `relief-night-flight-v2`, `relief-summit-saved` and `text-legacy-milo` have `"rasters": true` in the grid. Every export hash of all 158 cases, every existing dump, Tier A, the probes and the Libm asset (same SHA-256) are as in refs-v1. In the manifest only `generatedAt`, `durationMs`, `generator.fontFiles`, `grid.sha256`, `pack` and the `rasters` of those four cases differ. Release `refs-v1` stays as it is for older checkouts.

## CoreGraphics is not deterministic across threads

Drawing the Night Flight or Summit Cable Car artwork into separate `CGContext`s on several threads at once does not give the bitmap a single draw gives: on macOS 26.6.2, 11 to 12 of 16 parallel draws differed from a sequential one, in 37 to 4,046 pixels by up to 140/255 (the Swift code shares no state; only CoreGraphics is common to them). The exporter therefore runs every case that draws (relief and text styles) one at a time and the other cases in parallel; with that, 2 × 16 parallel copies of both relief cases gave identical files, equal to the sequential result. The relief dumps double-check it: the artwork is drawn a second time and must reproduce the relief's field bit for bit after the blur. The app itself draws in a detached task, so an export that overlaps a preview rebuild of a relief or text pattern can differ slightly from these references; references are always the single-threaded result. Anyone dumping CoreGraphics rasters for the web port (WP-R) has to draw one at a time as well.

## Grid notes

`mac/cases/grid.json` follows the table in docs/plan.md, WP-V1, with these additions: `part` also takes `sun` (the app's sun model forces `kind = .sun` before normalizing, so a sun is not a cloud case with other parameters); `parameters: null` means no saved settings (the model's default: `.classic`, `.solid`, `kind.defaults`, …); `expect` checks values of the normalized settings (`parameters.x`, `pattern.x`, `purge.x`) or the filename, `expectError` a substring of an expected export error; `comment` is free text. The migration fixtures are raw JSON: the balloon, ring, cloud, sun, clip, pattern, text, Night Flight and Summit Cable Car migrations of the Swift tests and the five settings files in `references/fixtures/legacy-settings/`. Basket settings are complete objects because `BasketParameters` (like `PurgeSettings`) has synthesized `Codable` and rejects missing keys; `basket-partial-settings` records that error. `clip-small-head` is exported although the app disables its export (`notes.appExportDisabled`), so the port can compare that geometry too.
