// The seven filament colors of mac/Sources/BalloonStudio/BalloonPatterns.swift:10-24,
// in declaration order (the order of `FilamentColor.allCases` in every color picker).

export const FILAMENT_SWATCHES = [
  { name: 'Saffron', hex: '#DB6E2E' },
  { name: 'Cream', hex: '#F5EAD2' },
  { name: 'Rose', hex: '#BA4F5C' },
  { name: 'Sage', hex: '#31917D' },
  { name: 'Blue', hex: '#739BCB' },
  { name: 'Charcoal', hex: '#333D49' },
  { name: 'Midnight blue', hex: '#253D60' },
] as const;

/** Structurally the same union as `FilamentColor` in core/types.ts (WP-U2). */
export type FilamentColorName = (typeof FILAMENT_SWATCHES)[number]['name'];

export function filamentHex(name: FilamentColorName): string {
  return FILAMENT_SWATCHES.find((color) => color.name === name)?.hex ?? FILAMENT_SWATCHES[0].hex;
}
