import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { core } from '#core/parameters';
import type { BalloonSnapshot, CloudParameters, RingParameters } from '../core/types';
import { EXPORT_TABLE, exportedLine, exportPanel, fileNameFromField } from './exportTable';

const swift = (file: string): string => readFileSync(resolve(import.meta.dirname, '../../../mac/Sources/BalloonStudio', file), 'utf8');

const balloon = (change: Partial<BalloonSnapshot['parameters']> = {}, style: BalloonSnapshot['pattern']['style'] = 'Solid'): BalloonSnapshot => {
  const parameters = core.balloon.normalize({ ...core.balloon.presets.classic, ...change });
  return { parameters, pattern: core.balloon.pattern.normalize({ ...core.balloon.pattern.defaults, style }, parameters), purge: core.balloon.purge.defaults };
};
const ring = (change: Partial<RingParameters>) => core.ring.normalize({ ...core.ring.defaults, ...change });
const lamp = (kind: 'cloud' | 'sun', change: Partial<CloudParameters> = {}) => core.cloud.normalize({ ...core.cloud.defaults(kind), ...change });
const figure = core.figure.normalize(core.figure.defaults);
const clip = core.clip.normalize(core.clip.defaults);

const CLOSED_BALLOON = 'A closed, printable envelope in millimetres. Set walls and infill in your slicer.';
const HOLLOW_BALLOON = 'Hollow shell with an open neck for LEDs. Millimetres; use 0% infill and standard printing mode.';
const SOLID_RING = 'One ring for three balloons, with six cord holes and a top LED channel. Print flat, channel facing up.';
const UPLIGHT_RING = 'One continuous ring with three ceiling holes, three balloon holes and an upright LED mount. Print flat, trough facing up.';

describe('the export table', () => {
  it('balloon STL', () => {
    expect(exportPanel('balloon', balloon())).toEqual({
      title: 'Export Balloon STL',
      prompt: 'Export STL',
      suggestedName: core.balloon.filename(balloon().parameters),
      extension: 'stl',
      mime: 'model/stl',
      message: CLOSED_BALLOON,
      footerLabel: 'Export STL…',
      preparingLabel: 'Preparing STL…',
      savedPrefix: 'File',
    });
    expect(exportPanel('balloon', balloon()).suggestedName).toMatch(/^Balloon-.*\.stl$/);
    expect(exportPanel('balloon', balloon({ hollow: true })).message).toBe(HOLLOW_BALLOON);
  });

  it.each([
    ['Horizontal stripes', '-pattern'],
    ['Hearts', '-pattern'],
    ['Night Flight', '-night-flight'],
    ['Summit Cable Car', '-summit-cable-car'],
  ] as const)('balloon 3MF: %s', (style, suffix) => {
    const snapshot = balloon({}, style);
    const stem = core.balloon.filename(snapshot.parameters).replace('.stl', '');
    expect(exportPanel('balloon', snapshot)).toEqual({
      title: 'Export Balloon 3MF',
      prompt: 'Export 3MF',
      suggestedName: `${stem}${suffix}.3mf`,
      extension: '3mf',
      mime: 'model/3mf',
      message: 'Two filament colors with Bambu Studio paint assignments. Select your P2S profile and map colors after opening.',
      footerLabel: 'Export 3MF…',
      preparingLabel: 'Preparing 3MF…',
      savedPrefix: 'File',
    });
  });

  it('basket', () => {
    expect(exportPanel('basket', core.basket.defaults)).toEqual({
      title: 'Export Basket STL',
      prompt: 'Export Basket',
      suggestedName: core.basket.filename(core.basket.defaults),
      extension: 'stl',
      mime: 'model/stl',
      message: 'A separate open-top basket with four cord holes. Millimetres; print flat base down.',
      footerLabel: 'Export Basket STL…',
      preparingLabel: 'Preparing basket…',
      savedPrefix: 'Basket',
    });
  });

  it('solid ring, with and without the uplight, on and over the bed', () => {
    const solid = ring({ segmented: false, reflectedLED: false, diameter: 200 });
    expect(exportPanel('ring', solid)).toEqual({
      title: 'Export Mobile Ring STL',
      prompt: 'Export Ring',
      suggestedName: 'Mobile-Ring-200mm-3-balloons.stl',
      extension: 'stl',
      mime: 'model/stl',
      message: SOLID_RING,
      footerLabel: 'Export Ring STL…',
      preparingLabel: 'Preparing ring…',
      savedPrefix: 'Ring',
    });
    const big = ring({ segmented: false, reflectedLED: false, diameter: 1000 });
    expect(core.ring.derived(big).fitsP2S).toBe(false);
    expect(exportPanel('ring', big).message).toBe(`${SOLID_RING} This size exceeds the P2S bed.`);
    const uplight = ring({ segmented: false, reflectedLED: true, diameter: 200 });
    expect(exportPanel('ring', uplight).message).toBe(UPLIGHT_RING);
    expect(exportPanel('ring', uplight).suggestedName).toBe(core.ring.filename(uplight));
    const bigUplight = ring({ segmented: false, reflectedLED: true, diameter: 1000 });
    expect(exportPanel('ring', bigUplight).message).toBe(`${UPLIGHT_RING} This size exceeds the P2S bed; reduce diameter in the app for a test print.`);
  });

  it('ring kit', () => {
    const kit = ring({ segmented: true });
    expect(exportPanel('ring', kit)).toEqual({
      title: 'Export Ring Kit',
      prompt: 'Export Kit',
      suggestedName: core.ring.filename(kit),
      extension: 'zip',
      mime: 'application/zip',
      message: 'ZIP containing four STL designs, print quantities and assembly instructions. Every part fits the P2S; the assembled ring does not.',
      footerLabel: 'Export Ring Kit…',
      preparingLabel: 'Preparing ring…',
      savedPrefix: 'Ring',
    });
  });

  it.each([
    ['cloud', 'Cloud'],
    ['sun', 'Sun'],
  ] as const)('%s lamp kit', (kind, title) => {
    const p = lamp(kind, { width: 200 });
    const parts = 2 + core.cloud.derived(p).cableSides.length + 2 * core.cloud.cableConfigurations(p).filter((c) => core.cloud.clampFits(c)).length + (p.nailInsert && core.cloud.nailInsert(p) !== null ? 1 : 0);
    expect(exportPanel(kind, p)).toEqual({
      title: `Export ${title} Lamp Kit`,
      prompt: 'Export Kit',
      suggestedName: core.cloud.filename(p),
      extension: 'zip',
      mime: 'application/zip',
      message: `${parts} print-ready STLs, a full-size LED placement plan, cut list and assembly notes.`,
      footerLabel: `Export ${title} Kit…`,
      preparingLabel: 'Exporting…',
      savedPrefix: title,
    });
    expect(exportPanel(kind, p).suggestedName).toMatch(kind === 'sun' ? /^Sun-Lamp-.*-kit\.zip$/ : /^Cloud-Lamp-.*-kit\.zip$/);
    const wide = lamp(kind, { width: 1000 });
    expect(core.cloud.derived(wide).fitsP2S).toBe(false);
    expect(exportPanel(kind, wide).message).toMatch(/assembly notes\. This width exceeds the P2S bed with a brim\.$/);
  });

  it('single figure and figure set', () => {
    expect(exportPanel('figure', { parameters: figure, variant: 'single' })).toEqual({
      title: 'Export Figure STL',
      prompt: 'Export Figure',
      suggestedName: core.figure.filename(figure),
      extension: 'stl',
      mime: 'model/stl',
      message: 'One figure for the mobile, with its thread hole. Millimetres; print flat back down.',
      footerLabel: 'Export Figure STL…',
      preparingLabel: 'Preparing figure…',
      savedPrefix: 'Saved',
    });
    expect(exportPanel('figure', { parameters: figure, variant: 'set' })).toEqual({
      title: 'Export Figure Set',
      prompt: 'Export Set',
      suggestedName: core.figure.setFilename(figure),
      extension: 'zip',
      mime: 'application/zip',
      message: 'All seven figures at these settings, with printing and hanging notes. Millimetres; print flat back down.',
      footerLabel: 'Export all seven as a set (ZIP)…',
      preparingLabel: 'Preparing figure…',
      savedPrefix: 'Saved',
    });
  });

  it('cable clip', () => {
    expect(exportPanel('clip', clip)).toEqual({
      title: 'Export Cable Clip',
      prompt: 'Export Clip',
      suggestedName: core.clip.filename(clip),
      extension: 'stl',
      mime: 'model/stl',
      message: 'One-piece clip in print orientation. Millimetres.',
      footerLabel: 'Export Clip STL…',
      preparingLabel: 'Preparing clip…',
      savedPrefix: 'Saved',
    });
  });

  it('holds the strings of the Swift source, word for word', () => {
    const app = swift('BalloonStudioApp.swift');
    for (const text of ['Export Balloon \\(format)', 'Export \\(format)', 'Preparing \\(model.exportFormat)…', 'Export \\(model.exportFormat)…', 'File saved · Show in Finder', CLOSED_BALLOON, HOLLOW_BALLOON, exportPanel('balloon', balloon({}, 'Hearts')).message]) {
      expect(app).toContain(text);
    }
    const cases: [string, keyof typeof EXPORT_TABLE, string[]][] = [
      ['BasketEditor.swift', 'basket', ['Basket saved · Show in Finder']],
      ['RingEditor.swift', 'ringSolid', ['Ring saved · Show in Finder', SOLID_RING, UPLIGHT_RING, ' This size exceeds the P2S bed.', ' This size exceeds the P2S bed; reduce diameter in the app for a test print.']],
      ['RingEditor.swift', 'ringKit', []],
      ['FigureEditor.swift', 'figure', ['Saved · Show in Finder']],
      ['FigureEditor.swift', 'figureSet', []],
      ['CableClipEditor.swift', 'clip', ['Saved · Show in Finder']],
    ];
    for (const [file, key, extra] of cases) {
      const source = swift(file);
      const { title, prompt, footerLabel, preparingLabel } = EXPORT_TABLE[key];
      for (const text of [title, prompt, footerLabel, preparingLabel, ...extra]) expect(source, `${key}: ${text}`).toContain(text);
    }
    const messages: [string, string][] = [
      ['BasketEditor.swift', exportPanel('basket', core.basket.defaults).message],
      ['RingEditor.swift', exportPanel('ring', ring({ segmented: true })).message],
      ['CableClipEditor.swift', exportPanel('clip', clip).message],
      ['FigureEditor.swift', exportPanel('figure', { parameters: figure, variant: 'single' }).message],
      ['FigureEditor.swift', exportPanel('figure', { parameters: figure, variant: 'set' }).message],
    ];
    for (const [file, message] of messages) expect(swift(file)).toContain(message);
    const lamps = swift('CloudEditor.swift');
    for (const text of ['Export \\(kind.title) Lamp Kit', 'Export Kit', 'Exporting…', 'Export \\(title) Kit…', '\\(title) saved · Show in Finder', ' print-ready STLs, a full-size LED placement plan, cut list and assembly notes.', ' This width exceeds the P2S bed with a brim.']) {
      expect(lamps).toContain(text);
    }
  });
});

describe('exportedLine', () => {
  it('says what happened to the file, with the Mac’s prefixes', () => {
    expect(exportedLine('File', { filename: 'a.stl', mode: 'saved' })).toBe('File saved · a.stl');
    expect(exportedLine('Basket', { filename: 'a.stl', mode: 'downloaded' })).toBe('Basket downloaded · a.stl');
    expect(exportedLine('Sun', { filename: 'a.zip', mode: 'saved' })).toBe('Sun saved · a.zip');
    expect(exportedLine('Saved', { filename: 'a.stl', mode: 'saved' })).toBe('Saved · a.stl');
    expect(exportedLine('Saved', { filename: 'a.stl', mode: 'downloaded' })).toBe('Downloaded · a.stl');
  });
});

describe('fileNameFromField', () => {
  it('adds the extension exactly once', () => {
    expect(fileNameFromField('Lamp', 'zip')).toBe('Lamp.zip');
    expect(fileNameFromField('Lamp.zip', 'zip')).toBe('Lamp.zip');
    expect(fileNameFromField('Lamp.ZIP', 'zip')).toBe('Lamp.zip');
    expect(fileNameFromField('  Lamp v2.stl ', 'zip')).toBe('Lamp v2.stl.zip');
  });

  it('keeps path separators out and refuses an empty name', () => {
    expect(fileNameFromField('a/b\\c:d', 'stl')).toBe('a-b-c-d.stl');
    expect(fileNameFromField('', 'stl')).toBeNull();
    expect(fileNameFromField('  ', 'stl')).toBeNull();
    expect(fileNameFromField('.stl', 'stl')).toBeNull();
  });
});
