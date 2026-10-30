// @vitest-environment jsdom
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLED_FONTS } from '../core/text/fontSet';
import { BALLOON_TEXT_FONT_FACES, BALLOON_TEXT_FONT_FAMILIES, BALLOON_TEXT_FONTS, balloonTextFontFaceRules, installBalloonTextFontFaces } from './fonts';

describe('balloon text font faces', () => {
  it('declares exactly the files the core worker parses, and nothing else from public/fonts', () => {
    const files = BALLOON_TEXT_FONTS.map((font) => BALLOON_TEXT_FONT_FACES[font].file);
    expect(files).toEqual(BALLOON_TEXT_FONTS.map((font) => BUNDLED_FONTS[font].file));
    const onDisk = readdirSync(resolve(import.meta.dirname, '../../public/fonts')).filter((name) => name.endsWith('.ttf'));
    expect([...files].sort()).toEqual(onDisk.sort());
  });

  it('puts each declared family first in its stack', () => {
    for (const font of BALLOON_TEXT_FONTS) expect(BALLOON_TEXT_FONT_FAMILIES[font].startsWith(`"${BALLOON_TEXT_FONT_FACES[font].family}",`)).toBe(true);
  });

  it('builds the URLs from the base path, in the bold cut', () => {
    const rules = balloonTextFontFaceRules('/balloon-studio/').split('\n');
    expect(rules).toHaveLength(5);
    expect(rules[0]).toBe('@font-face { font-family: "Nunito"; src: url("/balloon-studio/fonts/Nunito-Bold.ttf") format("truetype"); font-weight: 700; font-style: normal; font-display: swap; }');
    for (const rule of rules) expect(rule).toContain('url("/balloon-studio/fonts/');
  });

  it('installs one style element', () => {
    installBalloonTextFontFaces();
    const style = document.head.querySelector('style[data-fonts="balloon-text"]');
    expect(style?.textContent).toContain('"DejaVu Sans Mono"');
    style?.remove();
  });
});
