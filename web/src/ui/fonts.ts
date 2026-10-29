import type { CSSProperties } from 'react';

// CSS families for the balloon lettering fonts, so the Font picker can render each option
// in its own typeface like PatternEditor.swift:56 (`Text(font.rawValue).font(.custom(...))`).
//
// The raw values are `BalloonTextFont` from mac/Sources/BalloonStudio/BalloonText.swift:5-17
// and stay as persisted. The Mac renders Apple system fonts (PostScript names in the
// comments); the web bundles OFL replacements (docs/plan.md, Abschnitt 7, Fonts).
//
// TODO(WP-R3/R7): add the @font-face rules once the TTFs live under web/public/fonts/,
// with these exact family names, font-weight 700 and `import.meta.env.BASE_URL` in the URL.
// Until then the stacks fall back to the Mac originals or a generic family.

export const BALLOON_TEXT_FONTS = ['Rounded', 'Sans serif', 'Serif', 'Handwritten', 'Monospaced'] as const;

/** Structurally the same union as `BalloonTextFont` in core/types.ts (WP-U2). */
export type BalloonTextFontName = (typeof BALLOON_TEXT_FONTS)[number];

export const BALLOON_TEXT_FONT_FAMILIES: Readonly<Record<BalloonTextFontName, string>> = {
  // ArialRoundedMTBold → Nunito Bold
  Rounded: '"Nunito", "Arial Rounded MT Bold", ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
  // Helvetica-Bold → Arimo Bold (Helvetica/Arial metrics)
  'Sans serif': '"Arimo", "Helvetica Neue", Helvetica, Arial, sans-serif',
  // Georgia-Bold → Gelasio Bold (Georgia metrics)
  Serif: '"Gelasio", Georgia, "Times New Roman", serif',
  // ChalkboardSE-Bold → Comic Neue Bold
  Handwritten: '"Comic Neue", "Chalkboard SE", "Comic Sans MS", cursive',
  // Menlo-Bold → DejaVu Sans Mono Bold (Menlo's ancestor)
  Monospaced: '"DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", monospace',
};

export function balloonTextFontFamily(font: BalloonTextFontName): string {
  return BALLOON_TEXT_FONT_FAMILIES[font];
}

/** Inline style for text set in a lettering font; every Mac face is the bold cut. */
export function balloonTextFontStyle(font: BalloonTextFontName): CSSProperties {
  return { fontFamily: BALLOON_TEXT_FONT_FAMILIES[font], fontWeight: 700 };
}
