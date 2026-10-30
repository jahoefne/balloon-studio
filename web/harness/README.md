# Comparison harness

Compares what the TypeScript core exports with what the Mac app exported (docs/plan.md, WP-V2). It runs in vitest on Node only: it uses `node:fs` and `node:crypto`, so import it from test files, never from `src/core` code.

## In a core work package

```ts
import { describe, it } from 'vitest';
import { binarySTL } from '../src/core/io/binaryStl';
import { expectNormalized, expectReference, expectReferenceError } from '../harness';

describe('clip against the Swift references', () => {
  it('clip-default', () => {
    const p = normalized(decode(getCase('clip-default').parameters));
    expectNormalized('clip-default', encode(p));              // step 1: settings, byte for byte
    expectReference('clip-default', binarySTL(generate(p)));  // throws on a mismatch
  });

  it('basket-partial-settings', () => {
    try { decode({ style: 'ribbed' }); } catch (error) { expectReferenceError('basket-partial-settings', error); return; }
    throw new Error('Swift fails here');
  });
});
```

Case ids are the ones in `references/manifest.json` and `mac/cases/grid.json`; `getCase(id)` returns a case with its raw `parameters`, `pattern`, `purge`, `quality` and `normalized` strings, `allCases()` all of them. Export a case at its `quality`.

| Call | Throws when |
| --- | --- |
| `expectReference(id, bytes, { strict?, allowUnverified?, tsMs?, skipEntries? })` | `mismatch`; `ulp`, `equivalent` or `equivalent-bounded` with `strict`; `unverified` on CI (`CI` set) unless `allowUnverified`. Returns the result, so a test can look at `ulpCount` or `entries`. |
| `expectReferenceError(id, thrown)` | `thrown` does not contain the manifest's `expectError` (else its `error`), or the case does not fail in Swift. |
| `expectNormalized(id, json, 'parameters' \| 'pattern' \| 'purge')` | The JSON differs from the manifest's string; the message names the key path. |

Without throwing: `compareCase(id, bytes, options)`, `compareCaseError(id, thrown)`, `compareOutput(expected, actual, kind)` return a `DiffResult`; `statusLabel(result)` gives `identical`, `ulp`, `equivalent`, `equivalent-bounded`, `mismatch (topology)` or `unverified-needs-pack`; `referenceAvailable(case)` and `hasPack()` say what is at hand.

**On CI without the pack** pass `{ allowUnverified: true }` for Tier B cases. Whatever Tier A and the manifest can check still fails on a mismatch (texts, JSON, SVG, small parts, triangle counts, bounding boxes, the settings header), and what only the pack can settle warns. `deploy.yml` has no pack so far; `compare-full.yml` has.

## Getting the pack

Tier A (`references/files`, every output or entry up to 300 KB, all clips) is committed. Tier B, 2 GB unpacked, is not:

```bash
bash mac/scripts/fetch-pack.sh
```

It unpacks to `references/pack/refs-v1/`, gitignored. A pack that already sits in `references/pack/` is used if its hash matches, otherwise the script downloads release `refs-v1`. Worktrees can share one unpacked pack:

```bash
export REFS_PACK_DIR=/path/to/checkout/references/pack/refs-v1
```

## What the statuses mean

1. `sha256(ts) === manifest.sha256` is `identical`.
2. Otherwise the reference body is loaded (Tier A or pack, hash-checked; a corrupt one throws). Without a body the case is `unverified-needs-pack`, unless the manifest already disproves it.
3. By kind (the extension decides inside archives):

| Kind | Rule | `mismatch (…)` tags |
| --- | --- | --- |
| STL | Same triangle count and order; each coordinate equal or one Float32 step apart with the same sign; attributes equal; both meshes welded by exact bits give identical index arrays; normals as below; header exact (`BSTL0002`: signature, flags, panels and settings exact, digest consistent with the file and different exactly when the body is). | `triangle count`, `stl format`, `topology`, `signed zero`, `ulp`, `attribute`, `normal`, `reference normal`, `header`, `digest` |
| ZIP | Same names in the same order; all header fields but CRC, sizes and offsets equal (version, flags, method, time, date, extra, comment, attributes, in central and local headers); no gaps; CRC equal exactly when the bytes are; entries by extension. | `zip`, plus those of the entries |
| 3MF | ZIP, and `3D/3dmodel.model` line by line: head and foot exact, `<triangle …/>` exact, `<vertex …/>` numeric within `MODEL_TOLERANCE`. The note counts text-equal vertex lines. | `model`, `triangle`, `vertex`, `signed zero` |
| JSON | Byte-identical. Otherwise the first differing key path, with `cause`: `numerically equal (writer bug)` (key order, spelling of a number or string, whitespace) or `different value (port bug)`. | `json` |
| Text (`.md`, `.txt`, `.svg`, `.xml`, `.rels`) | Byte-identical. Otherwise a unified diff in `notes[1]`. | `text` |

An archive takes the worst status of its entries: `mismatch` over `unverified` over `equivalent-bounded` over `equivalent` over `ulp`. JSON, text and SVG have no `ulp` state, so they are strict by construction; `strict: true` extends that to everything else.

`maxUlp` and `ulpCount` count vertex coordinates (Float32 steps in an STL, Float64 steps in a model); `normalDiffs` counts stored normals that differ within tolerance; `nearZeroCorners` counts STL coordinates under the near-zero rule below; `differingTriangles` is only set for `equivalent` and `equivalent-bounded`.

### `equivalent`

Rounding noise can flip a tie in a generator: the same vertices and the same body, but a fan starts one step later, so the bytes and the order of the triangles differ (plan §14). An STL whose only complaint is `topology` gets this check; the first note of the mismatch gives the outcome:

1. Same triangle count, same attribute bytes, header as usual (the check does not run otherwise).
2. Both meshes welded by exact bits: the unique vertices agree pairwise after a lexicographic sort, under the corner rule (at most 1 Float32 ULP with the same sign, or the near-zero rule).
3. Both meshes pass `BalloonMesh.validate` (closed, manifold).
4. Signed volume and surface area agree within 1e-9 relative.
5. `differingTriangles` counts the triangles that differ at their position in the file.

The sort in rule 2 is taken literally: a 1 ULP shift that changes the order of vertices sharing a coordinate breaks the pairs, and the file stays a mismatch. That errs on the safe side; the three listed kits have no such shift.

It passes as `equivalent` **only for an entry listed in `equivalentCases.ts`**, with its reason; anything else stays `mismatch (topology)`. A listed entry that comes out `identical` or `ulp` produces the warning "allowlist stale" (`warnings` on the result and in the report) and does not fail; a skipped or unverifiable entry says nothing. `strict` fails on `equivalent`, like on `ulp`.

### `equivalent-bounded`

A tie flip can also change the mesh a little, so that the vertex sets differ and `equivalent` cannot hold (plan §15): a pattern's refinement edge on a pixel column, a tie in a sculpted front's `refine`. Such an entry is measured, in an STL and in a `3D/3dmodel.model` alike:

1. Both meshes pass `BalloonMesh.validate`. The writer's part has to be right all the same: the STL's header, digest and normals, the model's text around the vertex and triangle tags.
2. Vertices are paired by the same Float32 bits after the near-zero rule. The limits apply to the triangle count difference, vertices without a partner, triangles without a partner (with their color or attribute), the largest distance of paired vertices (in Float64, so it is not 0 in a model), and the relative volume and area differences.

Counts are over both meshes together. A vertex without an exact partner that has a partnerless vertex within twice the distance limit counts as moved: it stays in the vertex count, keeps its triangles and enters the distance. Without that, the distance limit of an STL would say nothing.

It passes as `equivalent-bounded` **only for an entry in `BOUNDED_CASES`** (`equivalentCases.ts`), which names the reason, the replay proof and its own limits. Otherwise it stays a mismatch; over a limit it is `mismatch (bounds)`, an invalid mesh `mismatch (invalid mesh)`. A listed entry that comes out `identical`, `ulp` or `equivalent` warns "allowlist stale". Without the pack a listed entry is `unverified`, since its manifest facts may differ within the limits. `strict` fails on it; the report counts it apart and adds the measures to the row (`bounded`).

### Where this differs from the plan

- **Normals.** The plan asks for `normalFrom(vertices) === normal` bit for bit. The writer computes a normal from the Float64 vertices and then rounds both to Float32, so that cannot hold on a parsed file: it is true for 42 % of the 14.2 million triangles in `refs-v1`, and the worst deviation is `1 - dot < 1e-5`. The check on both files is `dot ≥ 1 - 1e-4` (`WRITER_NORMAL_DOT`). TS against Swift stays `dot ≥ 1 - 1e-6` as planned. A triangle with a smallest angle under 1° only gets a note with that angle when it fails either check.
- **Near zero in a model.** The limit is `1e-12 × max(|a|, |b|, 1)`, so 1e-14 against 2e-14 mm (cancellation) passes.
- **Signed zero in a model** is a mismatch, as in an STL.
- **Near zero in an STL.** If both values of a coordinate are below 1e-9 mm in size (`NEAR_ZERO_MM`), they count as equal whatever their sign and ULP distance: a coordinate that should be 0 comes out as ±1e-14 mm under one libm and 0 under the other. The file is `ulp`, the coordinate goes into `nearZeroCorners` and not into `ulpCount` or `maxUlp`. Everything else stays strict, including two exact zeros of opposite sign and the welded topology.

## The grid

`grid.reference.test.ts` runs every case through the `CoreApi` the way `mac/ReferenceExporter/main.swift` does, and checks normalized settings, filename and bytes.

```bash
npm run test:reference                                         # stub core: skipped
VITE_CORE=real npm run test:reference                          # all cases, writes references/report.json
REFS_CASES='clip-*,cloud-classic' VITE_CORE=real npm run test:reference
REFS_SHARD=2/4 VITE_CORE=real npm run test:reference
```

It fails on `mismatch` and `unverified`; `ulp`, `equivalent` and `equivalent-bounded` pass. It prints `id | status | maxUlp | ulpCount | tsMs | swiftMs | note`; `references/report.json` has the same rows plus a summary and the stale warnings. Under `npm test` (stub core) only the structure runs: every case decodes and exports one file.

The relief and text groups are exempt from the byte criterion (plan §1), so the grid leaves `3D/3dmodel.model` and `Metadata/balloon-studio.txt` out of those 31 cases (`skipEntries`). With injected Swift rasters, WP-K3 calls `expectReference` without that option.

`core/real` honors two `ExportOptions` the app does not use (`GridRunOptions` in `exportCase.ts`): `quality` for the 59 preview-quality cases, and `ignoreExportProblem` for `clip-small-head`, which the app refuses to export but the reference keeps.

## Files

`index.ts` public API · `compare.ts` entry points and dispatch · `stlDiff.ts`, `solidDiff.ts`, `boundedDiff.ts`, `zipDiff.ts`, `threeMfDiff.ts`, `jsonDiff.ts`, `textDiff.ts` the comparisons · `equivalentCases.ts` the allowlists · `manifest.ts` manifest and grid · `refs.ts` reference bodies · `report.ts` table and JSON · `result.ts` `DiffResult` · `exportCase.ts` grid case to `CoreApi` call · `fixtures.ts` test fixtures · `*.test.ts` self-tests (`pack.test.ts` needs the pack and is skipped without it).
