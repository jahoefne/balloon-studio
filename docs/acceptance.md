# Acceptance of the web port

The result of WP-V4 (`docs/plan.md` §8 and §10): what was measured, what was decided, and what is still open. Measured on 2026-10-30 at `main` 5d9ca7b, against the reference pack `refs-v1`.

**Result:** the TypeScript core reproduces the Mac app's exports across the whole grid: 158 cases, 0 `mismatch`, 0 `unverified`. Every budget is met, the unmodified Blender verifiers pass on files the web core wrote, and the deployed page is the build of `main`. M0 to M3 are reached. **M4 and M5 are not:** `verify-3mf.py` has not run on web 3MFs, one parity row is open (both WP-R7), and Safari.app, Windows and the Bambu Studio import are for the user to check.

## 1. Reference report

`references/report-refs-v1.json` is the committed report of this pack; `references/PACK.md` says how to make the next one. It comes from one run without shards on an Apple silicon Mac with 18 cores (macOS 26.6.2, Node 26.12.1), with other sessions active on the machine (load average 7 to 13).

```bash
cd web
VITE_CORE=real npm run test:reference
npm run bench
```

### Status per part

| Part | Cases | identical | ulp | equivalent | equivalent-bounded | mismatch | unverified | `maxUlp` | differing coordinates | `nearZeroCorners` | normals within tolerance | TS, s | Swift, s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| balloon | 21 | 20 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 53.7 | 11.7 |
| pattern (identity) | 10 | 0 | 10 | 0 | 0 | 0 | 0 | 5 | 71,177 | 0 | 0 | 6.0 | 3.1 |
| pattern (relief) | 9 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 38.5 | 14.8 |
| pattern (text) | 22 | 22 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5.5 | 3.1 |
| basket | 11 | 1 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2,641 | 2.8 | 0.9 |
| ring | 14 | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.1 | 0.1 |
| cloud | 29 | 0 | 26 | 1 | 2 | 0 | 0 | 0 | 0 | 1,468 | 16,403 | 12.6 | 21.1 |
| sun | 12 | 2 | 9 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 192 | 11.4 | 7.1 |
| figure | 9 | 4 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 217 | 0.9 | 1.3 |
| figure set | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 635 | 2.0 | 2.6 |
| clip | 19 | 6 | 13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 60 | 0.0 | 0.0 |
| **All** | **158** | **78** | **76** | **2** | **2** | **0** | **0** | **5** | **71,177** | **1,468** | **20,150** | **133.6** | **65.8** |

Statuses are defined in `web/harness/README.md`. How to read the table:

- **Relief and text rows cover less than the others.** Plan §1 exempts the rasterizer from the byte criterion, so the grid leaves `3D/3dmodel.model` and `Metadata/balloon-studio.txt` out of these 31 cases. They are `identical` in what remains: normalized settings, filename, ZIP structure and the other entries. Their models are compared on Swift's rasters in `web/tests/patterns.reference.test.ts`: 29 `ulp` and 12 `equivalent-bounded` ([class 3](#the-three-classes)). Text and reliefs drawn by the web rasterizer are checked by tolerance against CoreGraphics (plan §7, `web/tests/fixtures/README.md`), not against these hashes.
- **`maxUlp` and differing coordinates** count Float32 steps in an STL. The 71,177 in `pattern (identity)` are Float64 steps in the text of a 3MF model (at most 5), where Float32 cannot hide them; the harness limit there is 1e-12 relative.
- **`nearZeroCorners`** are coordinates under 1e-9 mm that should be 0, and they are all in clouds of 100 to 125 mm.
- **`basket-partial-settings`** counts as `identical`: Swift refuses those settings, and the core refuses them with the same message.
- No entry on the allowlists came out stale.

### Times

The TS column of the table above is the sum of `tsMs`, measured under vitest, which about doubles core times (`docs/plan.md` §15). The Swift column is the sum of `durationMs` from the manifest, measured with six cases at a time, so neither is a clean comparison. `npm run bench` is the fair one: bundled like the app, one thread, three rounds.

| Case | Budget, ms | Median, ms | CPU, ms | Swift `durationMs` |
| --- | ---: | ---: | ---: | ---: |
| Balloon classic, export | 1500 | 99 | 125 | 136 |
| Hollow + tethered + hanger, export | 5000 | 2177 | 2266 | 1378 |
| Figure set | 15000 | 776 | 811 | 1121 |
| Wicker basket, export | 6000 | 257 | 360 | 291 |
| Hearts 3MF | 8000 | 316 | 437 | 413 |
| Cloud 230 kit | 6000 | 62 | 126 | 567 |
| Sun kit | 12000 | 129 | 214 | 286 |
| Sculpted sun 500, preview | 8000 | 1120 | 1251 | 1131 |
| `relief-night-flight-classic` | – | 1375 | 1720 | 1508 |
| `relief-night-flight-round` | – | 2211 | 2780 | 2587 |
| `relief-summit-classic` | – | 1965 | 2347 | 2186 |
| `text-rounded-hello` | – | 117 | 170 | 144 |
| `sun-sculpted-soft-star` | – | 2309 | 2498 | 2259 |
| `cloud-sculpted-classic` | – | 1024 | 1117 | 1589 |
| `balloon-hollow-classic` | – | 1636 | 1680 | 1169 |
| `balloon-tethered-classic` | – | 1750 | 1792 | 1223 |
| `balloon-hanger-small` | – | 7394 | 7451 | 4072 |
| `figureset-two-sided` | – | 1086 | 1180 | 1438 |

All eight budgets of WP-K9 are met. The slowest case is `balloon-hanger-small` at about twice Swift's time; it has no budget.

## 2. Decision record

### What the criterion is now

Plan §1 asked for byte identity where deterministic, with at most 1 Float32 ULP at the same topology. The web core computes `sin`, `cos`, `atan2`, `hypot` and `pow` with a JavaScript fdlibm port (`core/swift/dmath.ts`), so that all browsers give the same bytes. The Mac app uses Apple's libm. The two differ in the last bit often enough to matter:

| Measured | Share or size |
| --- | --- |
| Float64 coordinates that differ, Apple vs fdlibm | 2.5 to 4 %, by 1 to 18 ULP (§14) |
| `sin`, `cos` arguments that differ | 3.4 % in the clip, 2.5 % in sculpted kits |
| `atan2` arguments that differ | 25 % in sculpted kits, up to 2 ULP; this is the source of the flips there |
| `pow` results that differ | about 10 %, 1 ULP; no flip, Float32 absorbs them |
| `hypot` arguments that differ | 3.3 % in sculpted kits |
| `__sincos_stret` sine vs `sin()` | 0.4 % of values, cosine never; a replay has to use the merged call |

Neither side is right: Apple is not correctly rounded either, and a correctly rounded kernel made the figures worse (§14).

### The three classes

| | 1. `ulp` | 2. `equivalent` | 3. `equivalent-bounded` |
| --- | --- | --- | --- |
| **Cause** | Noise that stays within the corner rule. Stored normals from near-cancelling cross products may differ by any number of Float32 steps | A tie flip: a post corner lies exactly between two hole points (45° between 37.5° and 52.5°) in `CableClamp.annulus` (`CableClamp.swift:361-363`), so a fan starts one step later | A tie flip that changes the mesh: an exact pixel column in `crossesBoundary`/`occupied`, or an exact tie in `refine` (`LampSurface.swift:237`, `:281`) |
| **What differs** | At most 1 Float32 ULP per corner, or coordinates under 1e-9 mm; normals by dot ≥ 1 − 1e-4 | The order of triangles. Vertex sets pair up within the corner rule | A few vertices and triangles |
| **Cases** | 76 in the grid, and 29 pattern models | 3 entries: `A-*-back-opaque.stl` of `cloud-drift`, `sun-cable-bottom`, `cloud-sculpted-billow-min` | 14 entries: 12 pattern models, 2 cloud fronts |
| **Measured** | 20,150 normals; 1,468 near-zero coordinates; corners at 0 ULP in every STL of the grid | 28 triangles each; volume and area equal within 1e-9 relative | Patterns: at most 86 vertices and 366 triangles without a partner over both meshes (of up to 1.5 million triangles), 96 triangles more or fewer, 1.43e-7 mm, volume 1.33e-8 and area 9.1e-9 relative. Limits: 200, 800, 800, 1e-6 mm, 1e-5, 1e-5. Fronts: at most 12 vertices and 36 triangles without a partner, 4 triangles more or fewer, 0.0093 mm, volume 4.5e-8 and area 8.7e-9 relative. Limits: 16, 64, 8, 0.02 mm, 1e-7, 1e-8 |
| **Proof it is libm** | With Apple's `sin`, `cos`: all 19 clips byte-identical (`tests/cableClip.reference.test.ts`, ran for this report). All 37 flat kits bit-identical at every vertex (PR #22, one-off, the test is not committed) | The same replay on `cloud-drift` and `sun-cable-bottom`: the flip goes away (PR #22). `cloud-sculpted-billow-min` passes with an empty allowlist under Apple's `atan2` (`tests/lampSurface.reference.test.ts`) | With Apple's values all 41 pattern 3MFs are byte-identical (`tests/patterns.replay.test.ts`, opt-in, on 2026-10-30; `text-sans-hello` again for this report: 4 rounds, `misses 0 identical`). With Apple's `atan2` for three arguments both fronts have Swift's corners (`tests/lampSurface.reference.test.ts`, ran for this report) |
| **Gate** | Harness rule, no list | `EQUIVALENT_CASES` in `web/harness/equivalentCases.ts`, not listed means `mismatch` | `BOUNDED_CASES` in the same file, with reason, replay and limits per entry, not listed or over a limit means `mismatch` |

A listed entry that comes out better gives a stale warning; none does today.

### Decision: no escalation

Plan §11 reserved one remedy for a real flip: a shared fdlibm port in Swift **and** TS, so that both sides compute the same bits. **The user decided against it twice on 2026-10-30:** for the annulus tie (the verdict `equivalent`, `docs/plan.md` §14) and for the tie flips that change a mesh (the verdict `equivalent-bounded`, §15).

What this leaves, and it is accepted: **the byte criterion holds per listed case, not for every parameter set.** Other settings can hit the same ties (a lamp's symmetric cells, a vertex on a pixel column), and the bytes then differ from a Mac export there too. No harness runs outside the grid. What holds everywhere is that an export runs `validate` before it is written, so a flip cannot produce an invalid mesh without failing the export. The largest measured geometric effect is 0.0093 mm on a sculpted front. The verifiers in [section 3](#3-external-verifiers-on-web-output) also pass on the flipped kits themselves.

### UI differences

`docs/parity-checklist.md` has 19 rows of decided differences, from these points:

| Difference | Why | Plan |
| --- | --- | --- |
| Reset is Alt+N (⌥N) plus a visible “Reset part” button, not ⌘N | A browser does not let a page catch ⌘N. In a text field ⌥N types its character | §6, §12 |
| Numbers always show a `.` decimal; input takes `,` and `.` | A locale-dependent `1.500` vs `1,5` does not fit a 44 px field | §6, §12 |
| The status line says “<Prefix> saved · <file>” or “<Prefix> downloaded · <file>”, with no “Show in Finder” | There is no web API for it. “saved” is File System Access, “downloaded” the blob fallback | §6 |
| Open is a file input plus a drop overlay with the Mac panel's message | No `NSOpenPanel` on the web | §6 |
| The About panel opens from the mark | The web has no menu bar | §6, WP-U5 |
| Bundled open fonts behind the same names: Nunito, Arimo, Gelasio, Comic Neue, DejaVu Sans Mono | The page cannot rely on Apple's fonts. Letters look different. No ligatures; CJK and emoji have no glyphs (and get a hint once WP-R7 is in); Comic Neue takes 60 Latin Extended-A letters from Nunito | §7, §15 |
| Text and relief patterns come from a deterministic rasterizer, visually equivalent and not byte-identical | The same reason as the fonts, and CoreGraphics is not available. A narrow tolerance exception applies along Night Flight's trails only (§15) | §1, §7 |
| The Mac camera's roll bug in `frame()` (36° on the filled neck) is not ported; the web keeps y up | The WP-U4 session's decision, recorded in the plan | §14 |
| The shortcut hint on export buttons has opacity 0.75 (Swift 0.65), `--ink-secondary` 0.7 | 4.5:1 contrast | WP-U10 |

## 3. External verifiers on web output

Plan §10 step 7. `mac/scripts/verify-cloud-blender.py` and `verify-cable-clip-blender.py` ran **unchanged**, in Blender 5.0.1, on files the real core wrote in Node through `CoreApi.export`, the call the page's worker makes. The script is `web/scripts/export-verifier-files.ts`; the `seated-*` files it adds are test-only and match what `mac/Tests` write (`CableClampTests.swift:292-298`, `NailInsertTests.swift:119-122`, `CableClipTests.swift:185-189`).

```bash
cd web
npx vite build --config bench/vite.config.ts --ssr scripts/export-verifier-files.ts --outDir node_modules/.verifier
node node_modules/.verifier/export-verifier-files.js /tmp/verifier
cd ..
blender --background --python mac/scripts/verify-cloud-blender.py -- /tmp/verifier/cloud-classic
blender --background --python mac/scripts/verify-cable-clip-blender.py -- /tmp/verifier/clip-default
```

| Folder | Printed parts and triangles (back, front or clip) | Result |
| --- | --- | --- |
| `cloud-classic`, the default kit | 5 STLs; 51,388 + 43,096 | `PASS` topology, self-intersection and seated assembly |
| `cloud-classic-seated`, with the seal and clamp in place | + 3 seated | `PASS`, and the clamp seated clear of back, front and seal |
| `sun-soft-star` | 5 STLs; 121,000 + 106,588 | `PASS` |
| `sun-soft-star-seated` | + 3 seated | `PASS`, clamp clear |
| `cloud-nail-insert-seated` | 6 STLs + insert in place | `PASS`, insert clear of the back but for its finger tips |
| `sun-nail-insert-seated` | 6 STLs + insert in place | `PASS`, same |
| `cloud-drift`, class 2 | 5 STLs; 53,542 + 44,944 | `PASS` |
| `sun-cable-bottom`, class 2 | 5 STLs; 121,096 + 106,556 | `PASS` |
| `cloud-sculpted-classic`, class 3 | 5 STLs; 51,388 + 141,190 | `PASS` |
| `cloud-sculpted-billow-min`, classes 2 and 3 | 5 STLs; 44,636 + 105,064 | `PASS` |
| `clip-default`, with `seated-clip.stl` and `seated-cable.stl` | clip 808, cable 128 | `PASS` print STL and seated clip for topology and self-intersection, cable clear of the clip |

**Read the `PASS` line, not the exit code.** Blender exits 0 even when the script's assertion fails. As a control, one triangle removed from a copy of the cloud back gave `AssertionError: A-cloud-back-opaque.stl` and exit code 0.

A rerun gives each part's dimensions, triangle count and volume: the cloud verifier writes them to `blender-validation.json` in the kit folder, the clip verifier prints them.

**Bambu Studio is manual, and it is for the user.** On the deployed page, open the Balloon tab, set the pattern to **Night Flight** and export `Balloon-180x220mm-20panels-night-flight.3mf`. Import it into Bambu Studio and check the colors and a P2S slice. Then the same with **Horizontal stripes**, whose file name ends in `-pattern.3mf`. `mac/scripts/verify-3mf.py` on web 3MFs belongs to WP-R7.

## 4. Acceptance checklist

### Definition of done per work package

Plan §4 asks for `identical` or `ulp` in the harness, a ported Swift test file with a census at least the Swift count minus the allowlist, and green checks. §14 and §15 extended the first to the two allowlist classes. Harness figures are from the table in section 1. A census cell is `needed → TS` from `npm run census`, for the whole Swift file; `GeometryTests.swift` is shared by K2, K5 and K8. The census compares totals (620 of 621 needed, 796 in TS) and not each assertion, so the gaps below can exist with a green census.

| WP | Scope | PR | Harness | Ported tests | Census | State |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | Swift semantics, geometry, IO | #2, #6 | no cases; probes in `references/probes` | `core/{swift,geometry,io,testing}/*.test.ts` | – | done |
| K2 | Balloon, STL import | #17, #24 | 20 identical, 1 ulp | `balloon.test.ts`, `stlImport.test.ts` | Geometry 81 → 124; STLImport 25 → 45 | done; the two legacy STL tests run only with `mac/output` (gap 2) |
| K3 | Pattern mesh, 3MF | #38, #50 | 10 ulp; models on Swift's rasters 29 ulp, 12 bounded | `patterns.test.ts`, `patterns.reference.test.ts`, `patterns.replay.test.ts` | Pattern 39 → 66 | done with class 3; gap 1 |
| K4a | Lamp outline, mesher, kit texts | #10, #22 | with K4b, K4c: cloud 26 ulp, 1 equivalent, 2 bounded; sun 2 identical, 9 ulp, 1 equivalent | `cloud.test.ts`, `cloudShape.test.ts`, `sun.test.ts`, `lampSettings.test.ts`, `lamp.reference.test.ts` | Cloud 32 → 32; CloudShape 14 → 14; Sun 37 → 38; LampSettings 8 → 9 | done; every `ASSEMBLY.md`, SVG and settings JSON byte-identical |
| K4b | Seal, clamp, insert | #26 | as above | `cableOutlet.test.ts`, `cableOutletChained.test.ts`, `cableClamp.test.ts`, `nailInsert.test.ts` | Outlet 89 → 90; Clamp 46 → 54; Nail 24 → 29 | done with class 2 |
| K4c | Sculpted front | #41, #49 | as above; 2 suns identical, 2 clouds bounded | `lampSurface.test.ts`, `lampSurface.reference.test.ts` | LampSurface 29 → 41 | done with class 3 |
| K5 | Rings | #8, #20 | 14 identical | `ring.test.ts`, `ring.reference.test.ts` | Geometry | done |
| K6 | Figures | #13, #21 | figure 4 identical, 5 ulp; set 2 ulp | `figures.test.ts`, `figures.reference.test.ts` | Figure 49 → 51 | done |
| K7 | Clip | #12, #28 | 6 identical, 13 ulp | `cableClip.test.ts`, `cableClip.reference.test.ts` | CableClip 47 → 67 | done |
| K8 | Basket | #9, #19 | 1 identical, 10 ulp | `basket.test.ts`, `basket.reference.test.ts` | Geometry; Wicker 9 → 9; BasketHole 4 → 4 | done |
| K9 | Real core, budgets | #30, #40, #42, #43 | whole grid | `core/real/real.test.ts` | – | done, all budgets met |
| R0 | Conventions, types | #3 | – | `core/raster/{affine,path,pgm}.test.ts`, `core/patterns/raster.test.ts` | – | done |
| R1 | Path geometry | #15 | – | `core/raster/{flatten,stroke,dash}.test.ts` | – | done |
| R2 | Scanline, canvas | #18, #27 | primitives against CoreGraphics | `core/raster/{scanline,clip,gradient,canvas,primitives}.test.ts` | – | done |
| R3 | Fonts, text | #29, #35 | masks against CoreText, worst IoU 0.99949 | `textFonts.test.ts`, `textShaper.test.ts`, `textMask.test.ts`, `textReference.test.ts` | – | done; three fonts lack a few code points, pinned |
| R4 | Night Flight | #32 | tolerances, exception along the trails | `nightFlightArtwork.test.ts` | NightFlight 48 → 70 | done |
| R5 | Summit Cable Car | #44 | tolerances, no exception | `summitCableCarArtwork.test.ts` | Summit 39 → 53 | done; gap 1 |
| R6 | Fixtures, hash gate | #31 | 21 hashes equal in Node and three engines, job `browser-hashes` | `hashes.test.ts`, `rasterFixtures.test.ts` | – | done; `mask-hashes.json` is not in the browser gate |
| R7 | Integration | open | – | – | – | **running** |
| R8 | CJK fallback | – | – | – | – | optional, not started |
| U0 | Bootstrap, Pages | commit 2a4e661 | – | – | – | done |
| U1 | UI primitives | #4 | – | `ui/*.test.ts(x)` | – | done |
| U2 | Contract, worker, stub | #1, #5 | – | `worker/*.test.ts`, `core/stub/*.test.ts` | – | done |
| U3 | Stores, persistence | #11 | – | `stores/*.test.ts`, `persistence/*.test.ts` | – | done; `error` serves export and preview alike |
| U4 | Preview | #16 | – | `preview/*.test.ts(x)` | – | done |
| U5 | Shell, Balloon, Pattern, import | #33 | parity: shell 25 + 4, Balloon 87 + 2, Pattern 45 + 1, 1 open | `app/App.test.tsx`, `editors/balloon/*`, `open/*` | – | done; the open row is R7's |
| U6 | Basket, Ring | #34 | parity: 50 + 2, 106 + 2 | `editors/{basket,ring}/*` | – | done |
| U7 | Cloud, Sun | #36 | parity: 118 + 2, 114 + 2 | `editors/cloud/*` | – | done |
| U8 | Figures, Clip | #37 | parity: 62 + 2, 61 + 2 | `editors/{figure,clip}/*` | – | done |
| U9 | Export, open | #45 | browser exports equal the harness status | `io/*.test.ts(x)` | – | done |
| U10 | Parity, accessibility | #48 | 688 rows: 668 identical, 19 decided, 1 open, 0 failing; walked again on both cores at this commit | `e2e/parity.spec.ts`, `e2e/smoke.spec.ts` | – | done, except for what the browser list below leaves open |
| V1 | Exporter, probes, pack | #7, #51 (open) | patch proof and a rerun: no difference | – | – | done for `refs-v1`; `refs-v2` waits for the release |
| V2 | Harness | #14, #23, #25, #39, #46 | self-tests | `harness/*.test.ts` | – | done |
| V3 | Tiers, census | #47 | – | `tests/support/tier.test.ts` | 620 of 621 | done; 1 allowed: `CloudTests:94-98` (UserDefaults) |
| V4 | This document | this PR | – | – | – | done, with the open points below |

For parity, “+ n” is the rows of decided differences on top of the identical ones.

### Milestones

| | State | What it rests on |
| --- | --- | --- |
| M0 | reached | Repository public, Pages deploys, `mac/` builds, probes committed |
| M1 | reached | All clip cases pass, the patch proof is green, shell and export on the stub |
| M2 | reached | Balloon, ring, figures and basket on the real core with ported tests, all editors present |
| M3 | reached | Lamp cluster on the real core; every kit text, SVG and settings JSON byte-identical |
| M4 | **open** | Everything but one item: `verify-3mf.py` has not run on web 3MFs (R7) |
| M5 | **open** | V3, K9 and V4 are done. Missing: the last parity row (R7), the browsers below, and the README's “under construction” and “Left” lines |

### CI at the measured commit

| Workflow on `main` | Result |
| --- | --- |
| Test and deploy to GitHub Pages: `build`, `real-core`, `browser-hashes`, `deploy` | success |
| Full reference comparison, 4 shards with the pack | success |
| Full test tier, 4 shards | running when this was written; its runs on the two commits before were cancelled by later pushes. The last complete run is the one on #47 before its merge: all four shards green, 25 to 32 minutes each. Check the workflow's page for a later result |

### Open points

| Point | Owner |
| --- | --- |
| WP-R7: `missingGlyphs` hint, `verify-3mf.py` on web 3MFs, pattern bench, `@font-face` picker. Closes M4 and the last parity row | R7 session (running) |
| Publish release `refs-v2`, then merge #51 | User, V1 session |
| `references/report-refs-v2.json` once #51 is in. Only the `release` field, new `durationMs` values and timings should differ | Whoever merges #51 |
| Bambu Studio import of a web 3MF (section 3) | User |
| Safari.app: needs “Allow remote automation”, or a run by hand. Windows Chrome and Edge. A real Finder or Explorer drag, the system's save dialog, a screen reader (`docs/manual-browser-checklist.md`) | User |
| Plan §10 step 6, the spot check: the same cloud kit from the web app and the Mac app, `shasum -a 256` per ZIP entry, and each app opening the other's `cloud-settings.json`. Not done by hand; the harness covers the bytes of a Node export and WP-U9 those of browser downloads, and the cross-opening has only fixtures | User |
| **Gap 1:** `PatternTests:104-107` (per font, `PaintedBalloon.make` with a real mask) and `SummitCableCarTests:100-110` (Summit settings, purge, persistence) are not ported | R7 or a follow-up |
| **Gap 2:** the two legacy STLs are only in `mac/output`, so those tests never run on CI. #51 does not add them | Next pack |
| `mask-hashes.json` is not in the cross-browser gate | Follow-up to R6 |
| README: “under construction”, and “Left” naming this report | Integrator, after R7 |

## 5. Deployed page against `main`

`VITE_CORE=real npm run build` at 5d9ca7b, with Node 26.12.1, compared by SHA-256 with what https://jahoefne.github.io/balloon-studio/ serves. CI builds with `lts/*` on Linux; the bytes are the same anyway. Source maps were left out.

| File | SHA-256, first 12 | Bytes | Same as deployed |
| --- | --- | ---: | --- |
| `404.html` | `e1c8f4f001f7` | 369 | yes |
| `assets/core.worker-BSkdHAlG.js` | `cf0a9a473e40` | 666,202 | yes |
| `assets/index-DNUrhv0x.css` | `07a3fad00030` | 41,845 | yes |
| `assets/index-DyGEtGdy.js` | `e238818bfef5` | 270,906 | yes |
| `assets/react-DctBZRDK.js` | `b81ed7799c66` | 218,790 | yes |
| `assets/rolldown-runtime-WkwZ5CU-.js` | `2629f2ad3cb7` | 599 | yes |
| `assets/three-B-Msrois.js` | `96bdd480a4ec` | 551,617 | yes |
| `favicon.svg` | `a2f5a830f201` | 286 | yes |
| `fonts/Arimo-Bold.ttf` | `d7a8b187cf84` | 485,872 | yes |
| `fonts/ComicNeue-Bold.ttf` | `3e7e5fccfd7e` | 55,716 | yes |
| `fonts/DejaVuSansMono-Bold.ttf` | `bce60f1b4421` | 331,992 | yes |
| `fonts/Gelasio-Bold.ttf` | `e0ef3addf1ac` | 148,380 | yes |
| `fonts/LICENSES.md` | `497fad3cd7bc` | 28,382 | yes |
| `fonts/Nunito-Bold.ttf` | `f922b74ed5cc` | 154,140 | yes |
| `index.html` | `5b07525137d8` | 842 | yes |
