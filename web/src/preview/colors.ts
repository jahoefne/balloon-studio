// Colors for the Stage props. Free of Three.js, so editors can use it without pulling it in.

/**
 * sRGB components 0…1, or any CSS color string. `NSColor(white:)` is the same number three
 * times (its gray gamma 2.2 converts to itself); `NSColor(calibratedRed:…)` goes through `calibrated`.
 */
export type PreviewColor = string | readonly [number, number, number];

const encodeSRGB = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (c: number): number => Math.min(1, Math.max(0, c));

/**
 * `NSColor(calibratedRed:green:blue:alpha:1)` in sRGB. Calibrated means Generic RGB: gamma 1.8
 * and its own primaries, so SceneKit shows (0.075, 0.09, 0.12) as (0.096, 0.120, 0.160).
 * Agrees with `usingColorSpace(.sRGB)` to 2e-5 (colors.test.ts has AppKit's numbers).
 */
export function calibrated(r: number, g: number, b: number): readonly [number, number, number] {
  const lr = r ** 1.8;
  const lg = g ** 1.8;
  const lb = b ** 1.8;
  return [
    clamp01(encodeSRGB(1.02525 * lr - 0.02655 * lg + 0.0013 * lb)),
    clamp01(encodeSRGB(0.01939 * lr + 0.94803 * lg + 0.03258 * lb)),
    clamp01(encodeSRGB(-0.00177 * lr - 0.00144 * lg + 1.00321 * lb)),
  ];
}

/** `FilamentColor.nsColor` (PatternEditor.swift:5-8) reads its `#RRGGBB` as calibrated components. */
export function calibratedHex(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return calibrated(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
