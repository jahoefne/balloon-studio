# Swift probes

Outputs of the probes in `mac/Probes/{Libm,Arith,Format,Json}`, built and run by `bash mac/scripts/build-probes.sh` (also part of `make-references.sh`). They pin the Swift runtime behaviour that the web port has to reproduce (docs/plan.md, Abschnitt 3 and WP-K1). Built with the same flags as the app: `swiftc -O -parse-as-library -swift-version 5 -target arm64-apple-macosx14.0`, Swift 6.3.3, macOS 26.6.2, Apple silicon. Format and Json are compiled with the core sources.

Random inputs come from SplitMix64 (definition in `libm.json` → `prng`; wrapping UInt64 arithmetic, `unit() = Double(next() >> 11) * 2^-53`, `uniform(lo, hi) = lo + (hi - lo) * unit()`), so a test can regenerate the arguments, recompute and compare the series' SHA-256 without the stored records. Bit patterns are lowercase hex without `0x`.

## Files

| File | Content |
| --- | --- |
| `libm.bin`, `libm.json` | Apple libm on core-like arguments: `sin`, `cos`, `tan`, `atan`, `atan2`, `asin`, `acos`, `exp`, `pow` (the 15 exponents the core uses, round robin), `sqrt`, `hypot`, `cbrt`, `log`, plus a fixed `edges` list. `libm.bin` holds the first 4096 records of each series as little-endian Float64 `[x, f(x)]` or `[a, b, f(a, b)]` at `offset`; `edges` records are `[function index, x, f(x)]`. `full.sha256` covers all 1,000,000 records of a series (args and result, same layout); the complete series are in the Tier B asset `balloon-studio-refs-v2-libm.tar.zst` as `probes/libm/<name>.bin`. Informative: dmath (fdlibm) is expected to differ from Apple libm in the last bit for a small share of arguments. |
| `arith.bin`, `arith.json` | Random series `fma` (`a*b+c`, `a*b-c*d`), `float` (`Float(x)` incl. exact midpoints between Floats), `rounded` (all rounding rules), `remainder` (`remainder(dividingBy:)` vs `truncatingRemainder`, incl. constructed ties), `float-ops` (Float `+ - * /` and `max(0, a/7)` as in `NightFlightRelief.smooth`), `int` (`Int(x)`, `Int(floor(x))`, `Int(x.rounded(.up))`, `Int(x.rounded())`); 4096 records each in `arith.bin` plus the SHA-256 of 1,000,000. `arith.json` also holds constants, contraction witnesses, `min`/`max` with signed zeros and NaN (two and three arguments), `Sequence.min()/max()`, `min(by:)/max(by:)`, sort stability on 10,000 ties, `sort()` of signed zeros and `stride` sequences. |
| `format.tsv.gz` | 100,000 values (`gzip -n`), one per line: `bits`, `group` (special, dyadic, decimal, coordinate = classic balloon preview vertices, float32, random), then `"\(x)"` (description), `String(format:"%.1f")`, `"%.2f"`, `"%g"`, `"%.17g"` with the `en_US_POSIX` locale. |
| `json.json` | JSONEncoder (sorted keys as StableJSON writes them: strings incl. escapes, doubles, floats, NaN error), JSONSerialization with the core's options (`.sortedKeys` compact as in `balloon-settings.json`, `.prettyPrinted .sortedKeys` as in `kit-manifest.json`) for Swift values and values parsed back from JSON, JSONDecoder rules (Int from `17.0`, rejected `17.5`/strings/numbers for Bool, `null`, synthesized vs custom `init(from:)`), and `PatternSettings.normalized` on combining marks, ZWJ emoji, flags, NBSP, U+2028, U+3000 and long texts. Every output is stored as the exact string Swift produced. |
| `zip-sample.zip` | `StoredZIP.archive` of four entries (`a.txt`, `dir/ü.json`, an empty entry, bytes 0…255); `json.json` → `storedZip` lists them. |

## Findings the port must follow

These differ from what a reader might assume, and some from the wording in docs/plan.md Abschnitt 3:

- **`String(format:"%.1f"/"%.2f")` rounds the shortest decimal representation, half to even**, not the exact binary value: `0.05 → "0.0"`, `0.15 → "0.2"`, `0.35 → "0.4"`, `0.45 → "0.4"`, `4.35 → "4.4"`, `2.675 → "2.68"`, `1.005 → "1.00"`, `0.125 → "0.12"`, `0.375 → "0.38"`, `99.995 → "100.00"`. A correctly rounded printf would give `0.1`, `0.1`, `0.3`, `0.5`, `4.3`, `2.67`. So: take the shortest round-trip digits (`Number.prototype.toString`), then round that decimal string half to even. Non-finite values print `INF`, `-INF`, `NaN`.
- **`"\(x)"` (description)** prints shortest digits with `.0` for integral values and switches to exponent form below 1e-4 and above 2^53, not at exponent 16: `9007199254740992.0`, but `9.007199254740994e+15`; `1e+16`, `1e-05`, `0.0001`, `-0.0`, `inf`, `nan`.
- **`String(format:"%g")`** uses an upper-case `E` with at least two exponent digits (`1E-05`, `1.5E-05`, `1E+15`, `1.23457E+06`), six significant digits, trailing zeros removed. The exponent decision is taken before rounding: `999999.5 → "1000000"` (C printf gives `1e+06`).
- **`String(format:"%.17g")` gives the shortest round-trip digits** (`0.3 → "0.3"`), not 17 digits. Only JSONSerialization writes 17 digits.
- **JSONSerialization writes doubles as C `%.17g`** with trailing zeros removed, whether the value is a Swift `Double` or a number it parsed: `0.3 → 0.29999999999999999`, `1e-5 → 1.0000000000000001e-05`, `165.3106828494337` stays (its 17th digit is 0), `450.0 → 450`, `-0.0 → -0`, `1e16 → 10000000000000000`, `Float(0.3) → 0.30000001192092896`. Strings escape `/` as `\/`; pretty printing is `"key" : value` with two-space indent and empty containers as `[\n\n  ]`-style blank lines (see `prettySorted`).
- **JSONEncoder writes the shortest digits**: `1e-05`, `1e-07`, `1e+16`, `450` for `450.0`, `-0` for `-0.0`, Floats via their own shortest digits (`Float(0.3) → 0.3`). Escapes: `\"`, `\\`, `\/`, `\n`, `\t`, `\r`, `\b`, `\f`, other control characters as `\u00XX`; DEL, U+2028, U+2029 and non-ASCII are written raw. `Double.nan` throws.
- **JSONDecoder** accepts `17.0` for an `Int`, rejects `17.5` and numbers out of range; `null` with `decodeIfPresent` counts as absent; a struct with synthesized `Codable` (`BasketParameters`, `PurgeSettings`) rejects any missing key, which the app answers by falling back to the defaults.
- **No FMA contraction**: `a*b+c` is rounded twice (`contraction` in `arith.json`).
- **`min(x, y)` returns `x` and `max(x, y)` returns `y` when they compare equal**: `min(0.0, -0.0) = 0.0`, `max(0.0, -0.0) = -0.0`. `Sequence.min()/max()` and `min(by:)/max(by:)` return the first of equal elements.
- **Sort is stable** (10,000 elements on 7 keys).

## Regenerating

`bash mac/scripts/build-probes.sh` (about a minute; `--no-full` skips the 230 MB of complete Libm series). The outputs are deterministic: a second run rewrites identical files.
