import { describe, expect, it } from 'vitest';
import { calibrated, calibratedHex } from './colors';

describe('calibrated', () => {
  // NSColor(calibratedRed:green:blue:alpha:1).usingColorSpace(.sRGB) on macOS 26.
  it.each([
    [[0.075, 0.09, 0.12], [0.09566, 0.11955, 0.16024]],
    [[0.12, 0.15, 0.19], [0.15907, 0.20043, 0.2488]],
    [[0.73, 0.81, 1], [0.77664, 0.85016, 1]],
    [[1, 0.91, 0.78], [1, 0.92619, 0.82011]],
    [[0.74, 0.84, 1], [0.78468, 0.87378, 1]],
    [[0.86, 0.43, 0.18], [0.89408, 0.5104, 0.23249]],
    [[0.35, 0.53, 0.46], [0.41929, 0.59551, 0.53434]],
    [[0.25, 0.58, 0.8], [0.30446, 0.6492, 0.83823]],
    [[0.93, 0.45, 0.2], [0.95162, 0.53117, 0.25641]],
    [[0.5, 0.5, 0.5], [0.57231, 0.57231, 0.57231]],
    [[1, 1, 1], [1, 1, 1]],
    [[0, 0, 0], [0, 0, 0]],
  ])('%j matches AppKit', (input, expected) => {
    const result = calibrated(input[0]!, input[1]!, input[2]!);
    result.forEach((value, i) => expect(Math.abs(value - expected[i]!)).toBeLessThan(5e-5));
  });

  it('reads filament hex colors the same way', () => {
    expect(calibratedHex('#DB6E2E')).toEqual(calibrated(0xdb / 255, 0x6e / 255, 0x2e / 255));
  });
});
