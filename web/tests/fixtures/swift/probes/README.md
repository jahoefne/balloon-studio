# Swift probes for WP-K1

These small Swift programs measured the Swift/Foundation behaviour that `web/src/core/swift/*`, `core/geometry/*` and `core/io/*` reproduce. Their outputs are the fixtures one directory up. They were run with Swift 6.3.3 on macOS 26 (Darwin 25.6). The official probe set of WP-V1 (`references/probes/*`) replaces them once it lands.

| Program | Output | Covers |
| --- | --- | --- |
| `format.swift` | `../format.tsv.gz` (gzip of stdout) | `"\(x)"`, `String(format:)` `%.0f`–`%.3f`, `%g`, `%.17g`, each with and without `Locale(identifier: "en_US_POSIX")`, on 2708 values |
| `arith.swift` | `../arith.txt` | description/`%g` boundaries, `rounded()`, `remainder(dividingBy:)`, FMA contraction, `min`/`max`, `Sequence.min()/max()`, stable sort, `stride(from:through:by:)`, `Character.isWhitespace`, grapheme counts |
| `json.swift` | `../json.txt` | JSONEncoder `.sortedKeys`, JSONSerialization pretty/compact `.sortedKeys`, escaping, number provenance |
| `keys.swift`, `keys2.swift` | `../keys.txt`, `../keys2.txt` | key order of both JSON writers: 700 random ASCII keys, all printable punctuation, digit runs and case |
| `geometry.swift` | `../geometry.txt`, `../../stl/*.stl`, `../../zip/*.zip` | `BalloonMesh.validate` errors, `dimensions`, `binarySTL`, `StoredZIP.archive`, `SurfaceQuery` |
| `cg-arcs.swift` (WP-R1) | `../cg-arcs.jsonl` | `CGMutablePath.addArc` element lists: the 16 sweeps of docs/plan.md §13 at three centres and radii, with and without a current point |
| `cg-stroke-dash.swift` (WP-R1) | none, the printed results are written out in `core/raster/stroke.test.ts` and `dash.test.ts` | `copy(strokingWithWidth:)` on degenerate subpaths and joins, `copy(dashingWithPhase:lengths:)` |
| `cg-dash-trail.swift` (WP-R4) | `../cg-dash-trail.txt` (one run per shape, each after a `shape <name>` line) | `copy(dashingWithPhase:lengths:)` on a Night Flight trail, and that a context with `setLineDash` draws the same bytes |

Build and run one program (stdout is the fixture):

```bash
DEVELOPER_DIR=/Library/Developer/CommandLineTools xcrun swiftc -O format.swift -o format && ./format | gzip -9 -n > ../format.tsv.gz
```

`geometry.swift` is compiled together with verbatim excerpts of the app sources, so the reference really is the app's code:

```bash
SRC=../../../../../mac/Sources/BalloonStudio
(echo 'import Foundation'; sed -n '99,210p' $SRC/BalloonGeometry.swift) > excerpt_mesh.swift
(echo 'import Foundation'; sed -n '56,85p' $SRC/ThreeMF.swift) > excerpt_zip.swift
cp $SRC/SurfaceQuery.swift excerpt_surface.swift
DEVELOPER_DIR=/Library/Developer/CommandLineTools xcrun swiftc -O geometry.swift excerpt_*.swift -o geometry
mkdir -p out && ./geometry out   # writes geometry.txt, tetra.stl, sphere3.stl, stored.zip, empty.zip
```

The generated numbers all come from the SplitMix64 generator in the programs. `web/tests/support/swiftProbe.ts` reproduces it, so the tests can regenerate the inputs and only the Swift results need to be stored.
