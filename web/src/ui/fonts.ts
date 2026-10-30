import type { CSSProperties } from 'react';

// CSS families for the balloon lettering fonts, so the Font picker can render each option
// in its own typeface like PatternEditor.swift:56 (`Text(font.rawValue).font(.custom(...))`).
//
// The raw values are `BalloonTextFont` from mac/Sources/BalloonStudio/BalloonText.swift:5-17
// and stay as persisted. The Mac renders Apple system fonts (PostScript names in the
// comments); the web bundles OFL replacements (docs/plan.md, Abschnitt 7, Fonts).
//
// The stacks name the @font-face family first; `installBalloonTextFontFaces` declares those
// families. The browser fetches a file only when text is set in it, so the picker costs nothing
// until the Text pattern is open. The fallbacks cover the moment before the file arrives.

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

/** Same files as BUNDLED_FONTS in core/text/fontSet.ts, which the UI thread must not import (it pulls in opentype.js). */
export const BALLOON_TEXT_FONT_FACES: Readonly<Record<BalloonTextFontName, { family: string; file: string }>> = {
  Rounded: { family: 'Nunito', file: 'Nunito-Bold.ttf' },
  'Sans serif': { family: 'Arimo', file: 'Arimo-Bold.ttf' },
  Serif: { family: 'Gelasio', file: 'Gelasio-Bold.ttf' },
  Handwritten: { family: 'Comic Neue', file: 'ComicNeue-Bold.ttf' },
  Monospaced: { family: 'DejaVu Sans Mono', file: 'DejaVuSansMono-Bold.ttf' },
};

/** The rules for the TTFs under web/public/fonts/, which the core worker parses too. */
export function balloonTextFontFaceRules(baseUrl: string = import.meta.env.BASE_URL): string {
  return BALLOON_TEXT_FONTS.map((font) => {
    const { family, file } = BALLOON_TEXT_FONT_FACES[font];
    return `@font-face { font-family: "${family}"; src: url("${baseUrl}fonts/${file}") format("truetype"); font-weight: 700; font-style: normal; font-display: swap; }`;
  }).join('\n');
}

/** Once at startup, from main.tsx. */
export function installBalloonTextFontFaces(target: Document = document): void {
  const style = target.createElement('style');
  style.dataset['fonts'] = 'balloon-text';
  style.textContent = balloonTextFontFaceRules();
  target.head.append(style);
}
