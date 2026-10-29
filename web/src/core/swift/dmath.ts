// Deterministic math for the whole core (docs/plan.md, Abschnitt 3 and 7).
//
// JavaScript engines disagree in the last bit of Math.sin/cos/… (V8 and
// SpiderMonkey ship fdlibm ports, JavaScriptCore calls the system libm), and
// Math.hypot / Math.pow differ in practice. Every transcendental function in
// web/src/core therefore goes through this module, which uses stdlib's pure-JS
// fdlibm ports built only from IEEE basic operations. The result is identical
// bytes in Chrome, Safari, Firefox and Node. Against Apple's libm (the Swift
// reference) rare 1-ULP differences remain; the reference harness tolerates
// them (≤ 1 Float32 ULP with identical topology).
//
// Allowed directly: Math.sqrt, Math.floor, Math.ceil, Math.trunc, Math.abs,
// Math.fround (all correctly rounded by spec). Banned in the core by lint:
// Math.sin/cos/tan/atan/atan2/asin/acos/exp/pow/log/cbrt/hypot, `**`,
// Math.min/max/round (see minmax.ts and rounding.ts for the Swift semantics).
//
// Swift → JS mapping used across the port:
//   Double.pi                      → PI
//   sin/cos/tan/atan/atan2/…       → the functions below
//   hypot(x, y)                    → hypot(x, y) = sqrt(x*x + y*y)
//   pow(x, 2)                      → x * x (write it out; never pow for squares)
//   pow(x, y)                      → pow(x, y)
//   log(x)                         → log(x)
//   x.rounded()                    → rounding.ts: rounded (half away from zero)
//   x.remainder(dividingBy: y)     → rounding.ts: ieeeRemainder
//   x.truncatingRemainder(…)       → %
//   Int(x) / Int(floor(x))         → Math.trunc / Math.floor
//   Float(x)                       → Math.fround
//   min(a, b) / max(a, b)          → minmax.ts: swiftMin / swiftMax (tie and -0 semantics)
import stdAcos from '@stdlib/math-base-special-acos';
import stdAsin from '@stdlib/math-base-special-asin';
import stdAtan from '@stdlib/math-base-special-atan';
import stdAtan2 from '@stdlib/math-base-special-atan2';
import stdCbrt from '@stdlib/math-base-special-cbrt';
import stdCos from '@stdlib/math-base-special-cos';
import stdExp from '@stdlib/math-base-special-exp';
import stdLn from '@stdlib/math-base-special-ln';
import stdPow from '@stdlib/math-base-special-pow';
import stdSin from '@stdlib/math-base-special-sin';
import stdTan from '@stdlib/math-base-special-tan';

export const PI: number = Math.PI;

export const sin = (x: number): number => stdSin(x);
export const cos = (x: number): number => stdCos(x);
export const tan = (x: number): number => stdTan(x);
export const atan = (x: number): number => stdAtan(x);
/** atan2(y, x), same argument order as Swift and Math.atan2. */
export const atan2 = (y: number, x: number): number => stdAtan2(y, x);
export const asin = (x: number): number => stdAsin(x);
export const acos = (x: number): number => stdAcos(x);
export const exp = (x: number): number => stdExp(x);
export const pow = (x: number, y: number): number => stdPow(x, y);
/** Natural logarithm (Swift `log`). */
export const log = (x: number): number => stdLn(x);
export const cbrt = (x: number): number => stdCbrt(x);
export const sqrt = (x: number): number => Math.sqrt(x);
/** Swift `hypot(x, y)` for the magnitudes used here: no overflow guard, deterministic basic ops only. */
export const hypot = (x: number, y: number): number => Math.sqrt(x * x + y * y);
