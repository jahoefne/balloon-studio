// Codecs and migrations of the stub core against the legacy fixtures and the settings
// assertions of the Swift tests (LampSettingsTests, GeometryTests:210-229, 336-339, 451-458,
// PatternTests:159-169, FigureTests:13-24, CableClipTests:17-31, SunTests:10-28,
// CloudTests:74-104, CloudShapeTests:5-6, CableOutletTests:13-18, 315-318).

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CoreFailure, INVALID_SETTINGS_MESSAGE, LAMP_SETTINGS_ERROR } from '../api';
import { core } from './index';

const fixtureDir = new URL('../../../../references/fixtures/legacy-settings/', import.meta.url);
const fixtures = readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, text: readFileSync(new URL(name, fixtureDir), 'utf8') }));

const failsWith = (run: () => unknown, code: string, message: string) => {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CoreFailure);
  expect((caught as CoreFailure).code).toBe(code);
  expect((caught as CoreFailure).message).toBe(message);
};

describe('legacy lamp settings fixtures', () => {
  it('finds the exported settings files', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });

  const expected: Record<string, { kind: string; width: number; depth: number; thickness: number; rowSpacing: number }> = {
    'cloud-lamp-100-cloud-settings.json': { kind: 'cloud', width: 100, depth: 16, thickness: 0.8, rowSpacing: 14 },
    'cloud-lamp-230-cloud-settings.json': { kind: 'cloud', width: 230, depth: 28, thickness: 1.2, rowSpacing: 14 },
    'cloud-lamp-100-led-rows-cloud-settings.json': { kind: 'cloud', width: 100, depth: 22, thickness: 0.8, rowSpacing: 14 },
    'cloud-lamp-239-led-rows-cloud-settings.json': { kind: 'cloud', width: 239, depth: 22, thickness: 0.8, rowSpacing: 18 },
    'sun-lamp-200-sun-settings.json': { kind: 'sun', width: 200, depth: 22, thickness: 1.2, rowSpacing: 14 },
  };

  for (const { name, text } of fixtures) {
    it(`opens ${name} like LampSettingsFile.decode`, () => {
      const p = core.lampSettings.decode(text);
      const want = expected[name];
      if (want) {
        expect(p.kind).toBe(want.kind);
        expect([p.width, p.depth, p.diffuserThickness, p.ledRowSpacing]).toEqual([want.width, want.depth, want.thickness, want.rowSpacing]);
        expect([p.style, p.mirrored, p.sunStyle, p.surface]).toEqual(['classic', false, 'soft-star', 'flat']);
      }
      expect(core.cloud.normalize(p)).toEqual(p);
    });

    it(`decodes ${name} with the preferences codec and re-encodes stably`, () => {
      const decoded = core.cloud.codec.decode(text);
      const once = core.cloud.codec.encode(decoded);
      const again = core.cloud.codec.encode(core.cloud.codec.decode(once));
      expect(again).toBe(once);
      expect(core.cloud.codec.decode(once)).toEqual(decoded);
      // nil outlets stay out of the JSON, like JSONEncoder.
      expect(once).not.toContain('secondCableSide');
      expect(once).not.toContain('null');
    });
  }
});

describe('LampSettingsFile', () => {
  it('restores every saved option of a cloud and a sun', () => {
    const cloud = {
      ...core.cloud.defaults('cloud'),
      style: 'billow' as const,
      mirrored: true,
      width: 239,
      depth: 28,
      diffuserThickness: 0.8,
      surface: 'sculpted' as const,
      surfaceDepth: 20,
      stripWidth: 10,
      stripThickness: 4,
      stripCutLength: 25,
      ledRowSpacing: 18,
      clipFit: 0.4,
      cableDiameter: 5,
      cableSide: 'left' as const,
      strainRelief: false,
      nailHead: 9,
      nailShaft: 4,
      nailInsert: true,
      nailDiameter: 2.1,
      nailHeadDiameter: 4.2,
    };
    for (const input of [cloud, { ...cloud, kind: 'sun' as const, sunStyle: 'pinwheel' as const }]) {
      const expected = core.cloud.normalize(input);
      expect(core.lampSettings.decode(core.cloud.codec.encode(expected))).toEqual(expected);
    }
  });

  it('migrates former suns, sparse files and out-of-range values', () => {
    const former = core.lampSettings.decode('{"kind":"sun","sunStyle":"halo","width":180,"depth":22,"diffuserThickness":1.2}');
    expect([former.kind, former.sunStyle, former.width]).toEqual(['sun', 'soft-star', 180]);
    const sparse = core.lampSettings.decode('{"width":100,"depth":16,"diffuserThickness":0.8}');
    expect([sparse.kind, sparse.stripCutLength, sparse.ledRowSpacing]).toEqual(['cloud', 16, 14]);
    const clamped = core.lampSettings.decode('{"width":999,"depth":-1,"diffuserThickness":0,"stripWidth":12,"ledRowSpacing":1}');
    expect([clamped.width, clamped.depth, clamped.diffuserThickness, clamped.ledRowSpacing]).toEqual([500, 16, 0.8, 16]);
  });

  it.each([
    '',
    '{',
    '[]',
    'null',
    '{}',
    '{"unrelated":true}',
    '{"width":100,"depth":16}',
    '{"width":null,"depth":16,"diffuserThickness":0.8}',
    '{"width":"100","depth":16,"diffuserThickness":0.8}',
    '{"width":100,"depth":16,"diffuserThickness":0.8,"kind":"basket"}',
    '{"width":100,"depth":16,"diffuserThickness":0.8,"style":"unknown"}',
    '{"width":100,"depth":16,"diffuserThickness":0.8,"mirrored":"yes"}',
    '{"width":1e999,"depth":16,"diffuserThickness":0.8}',
  ])('rejects %s with the Mac message', (text) => {
    failsWith(() => core.lampSettings.decode(text), 'invalid-lamp-settings', LAMP_SETTINGS_ERROR);
  });

  it('keeps the typographic apostrophe of the Mac string', () => {
    expect(LAMP_SETTINGS_ERROR).toContain('doesn’t');
  });
});

describe('cloud and sun preferences', () => {
  it('keeps saved clouds and suns through the migrations', () => {
    const old = core.cloud.codec.decode('{"width":188,"style":"twin","mirrored":true}');
    expect([old.kind, old.style, old.mirrored, old.width]).toEqual(['cloud', 'twin', true, 188]);
    const shape = core.cloud.codec.decode('{"width":188,"depth":28,"clipFit":0.45}');
    expect([shape.style, shape.mirrored, shape.width, shape.depth, shape.clipFit]).toEqual(['classic', false, 188, 28, 0.45]);
    const legacySun = core.cloud.codec.decode('{"kind":"sun","width":188,"depth":34,"diffuserThickness":2}');
    expect([legacySun.width, legacySun.depth, legacySun.diffuserThickness]).toEqual([188, 34, 2]);
    for (const former of ['halo', 'radiant']) {
      const saved = core.cloud.codec.decode(`{"kind":"sun","sunStyle":"${former}","width":188,"depth":34}`);
      expect([saved.kind, saved.sunStyle, saved.width, saved.depth]).toEqual(['sun', 'soft-star', 188, 34]);
      expect(core.cloud.normalize(saved)).toEqual(saved);
    }
    const legacy = core.cloud.codec.decode('{"width":100,"depth":16,"diffuserThickness":0.8,"stripThickness":4}');
    expect([legacy.width, legacy.depth, legacy.stripThickness, legacy.stripCutLength, legacy.ledRowSpacing]).toEqual([100, 16, 4, 16, 14]);
    const sideOutlet = core.cloud.codec.decode('{"kind":"sun","width":188,"cableDiameter":4}');
    expect([sideOutlet.cableSide, sideOutlet.cableDiameter, sideOutlet.width]).toEqual(['right', 4, 188]);
  });

  it('decodes one and two outlets without inventing more', () => {
    const one = core.cloud.codec.decode('{"kind":"cloud","cableSide":"top"}');
    expect(core.cloud.derived(one).cableSides).toEqual(['top']);
    expect(one.secondCableSide).toBeNull();
    const pair = core.cloud.codec.decode('{"kind":"sun","cableSide":"top","secondCableSide":"left"}');
    expect(core.cloud.derived(pair).cableSides).toEqual(['top', 'left']);
    const saved = core.cloud.codec.encode(pair);
    expect(saved).not.toContain('third');
    expect(saved).not.toContain('fourth');
  });

  it('normalizes like CloudParameters.normalized', () => {
    const bad = { ...core.cloud.defaults('cloud'), width: NaN, depth: Infinity, diffuserThickness: -1, clipFit: 10, nailHead: 5, nailShaft: 100, cableDiameter: NaN };
    const fixed = core.cloud.normalize(bad);
    expect([fixed.width, fixed.depth, fixed.diffuserThickness, fixed.clipFit, fixed.nailShaft, fixed.cableDiameter]).toEqual([230, 22, 0.8, 0.5, 3, 3]);
    expect(core.cloud.normalize(fixed)).toEqual(fixed);
    const sun = core.cloud.normalize({ ...core.cloud.defaults('sun'), width: 20, depth: NaN, style: 'twin', mirrored: true });
    expect([sun.width, sun.depth, sun.style, sun.mirrored]).toEqual([160, 22, 'classic', false]);
    expect(core.cloud.normalize({ ...core.cloud.defaults('cloud'), sunStyle: 'cones' }).sunStyle).toBe('soft-star');
    const small = core.cloud.normalize({ ...core.cloud.defaults('cloud'), width: 100, depth: 16 });
    expect([small.width, small.depth, small.stripWidth, small.cableDiameter, small.nailHead]).toEqual([100, 16, 8, 3, 8]);
    expect(core.cloud.derived(small).height).toBeGreaterThan(58);
    const nails = core.cloud.normalize({ ...core.cloud.defaults('cloud'), nailInsert: true, nailDiameter: NaN, nailHeadDiameter: 100 });
    expect([nails.nailDiameter, nails.nailHeadDiameter]).toEqual([1.8, 8]);
  });

  it('round-trips the defaults of both kinds', () => {
    for (const kind of ['cloud', 'sun'] as const) {
      const p = core.cloud.defaults(kind);
      expect(core.cloud.codec.decode(core.cloud.codec.encode(p))).toEqual(p);
    }
  });
});

describe('balloon, pattern and purge preferences', () => {
  it('normalizes invalid input and the hanger before the height', () => {
    const invalid = core.balloon.normalize({ ...core.balloon.defaults, height: NaN, diameter: Infinity, panels: Number.MAX_SAFE_INTEGER, panelDepth: -2, neckDiameter: -5, neckHeight: 500, shoulder: 1000 });
    expect([invalid.height, invalid.diameter, invalid.panels, invalid.neckDiameter, invalid.neckHeight]).toEqual([220, 180, 32, 12, 20]);
    const bad = core.balloon.normalize({ ...core.balloon.defaults, height: 250, hangingLoop: true, hangingClearance: NaN, hangingThickness: Infinity, hangingWall: 100, hangingFillet: -2, hangingCrownThickness: NaN });
    expect([bad.hangingClearance, bad.hangingThickness, bad.hangingWall, bad.hangingFillet, bad.hangingCrownThickness]).toEqual([4, 12, 8, 2.5, 5]);
    expect(core.balloon.derived(bad).totalHeight).toBeLessThanOrEqual(256);
    expect(core.balloon.normalize(bad)).toEqual(bad);
  });

  it('migrates version 1 settings and the old hanger', () => {
    const migrated = core.balloon.codec.decode('{"height":215,"diameter":175,"panels":24,"panelDepth":5,"neckDiameter":30,"neckHeight":7,"shoulder":67}');
    expect([migrated.height, migrated.diameter, migrated.hollow, migrated.wallThickness]).toEqual([215, 175, false, 1.2]);
    expect([migrated.hangingThickness, migrated.hangingWall, migrated.hangingFillet, migrated.hangingCrownThickness]).toEqual([12, 6, 4, 5]);
    const oldHanger = core.balloon.normalize(core.balloon.codec.decode('{"height":244,"hangingLoop":true,"hangingClearance":4}'));
    expect([oldHanger.height, core.balloon.derived(oldHanger).totalHeight, oldHanger.hangingLoop]).toEqual([240, 256, true]);
    const rigged = { ...migrated, hollow: true, wallThickness: 0.8, stringHoles: true, cordClearance: 4.5, hangingLoop: true, hangingClearance: 5, hangingThickness: 14.5, hangingWall: 7, hangingFillet: 3.5, hangingCrownThickness: 6.2 };
    expect(core.balloon.codec.decode(core.balloon.codec.encode(rigged))).toEqual(rigged);
  });

  it('rejects wrong types like JSONDecoder', () => {
    for (const text of ['{"panels":20.5}', '{"hollow":1}', '{"height":"220"}', '[]', 'nope']) {
      failsWith(() => core.balloon.codec.decode(text), 'invalid-settings', INVALID_SETTINGS_MESSAGE);
    }
  });

  it('migrates patterns saved before text and before relief composition 3', () => {
    const legacy = core.balloon.pattern.codec.decode('{"style":"Hearts","bands":10,"repeats":5,"rows":3,"size":12,"base":"Rose","detail":"Cream"}');
    expect([legacy.style, legacy.repeats, legacy.rows, legacy.base, legacy.size]).toEqual(['Hearts', 5, 3, 'Rose', 12]);
    expect([legacy.text, legacy.textRepeats, legacy.textFont]).toEqual(['Hello', 3, 'Rounded']);
    expect(legacy.reliefDepth).toBe(2.4);
    expect(core.balloon.pattern.codec.decode('{"reliefDepth":1.5}').reliefDepth).toBe(2.4);
    expect(core.balloon.pattern.codec.decode('{"reliefDepth":1.5,"flightCompositionVersion":3}').reliefDepth).toBe(1.5);
    failsWith(() => core.balloon.pattern.codec.decode('{"style":"Zebra"}'), 'invalid-settings', INVALID_SETTINGS_MESSAGE);
  });

  it('normalizes pasted text to one line of at most 64 characters', () => {
    const p = core.balloon.defaults;
    expect(core.balloon.pattern.normalize({ ...core.balloon.pattern.defaults, text: 'Hello\nworld\t!' }, p).text).toBe('Hello world !');
    const long = core.balloon.pattern.normalize({ ...core.balloon.pattern.defaults, text: 'é'.repeat(70) }, p).text;
    expect([...long].length).toBe(64);
    // Grapheme clusters count once, like Swift Characters.
    const family = '👨‍👩‍👧';
    expect(core.balloon.pattern.normalize({ ...core.balloon.pattern.defaults, text: family.repeat(65) }, p).text).toBe(family.repeat(64));
    expect(core.balloon.pattern.normalize({ ...core.balloon.pattern.defaults, text: 'a b' }, p).text).toBe('a b');
  });

  it('round-trips normalized patterns and requires every purge key', () => {
    const pattern = core.balloon.pattern.normalize({ ...core.balloon.pattern.defaults, style: 'Text', text: 'Zoë & Léa <3 / 2' }, core.balloon.defaults);
    const encoded = core.balloon.pattern.codec.encode(pattern);
    expect(encoded).toContain('<3 \\/ 2');
    expect(core.balloon.pattern.codec.decode(encoded)).toEqual(pattern);
    const purge = core.balloon.purge.defaults;
    expect(core.balloon.purge.codec.decode(core.balloon.purge.codec.encode(purge))).toEqual(purge);
    failsWith(() => core.balloon.purge.codec.decode('{"layerHeight":0.2}'), 'invalid-settings', INVALID_SETTINGS_MESSAGE);
    expect(core.balloon.purge.normalize({ ...purge, layerHeight: NaN, baseToDetail: 9999, density: 0 })).toEqual({ ...purge, baseToDetail: 1500, density: 0.5 });
  });
});

describe('ring, basket, figure and clip preferences', () => {
  it('ring: legacy settings, normalization and round trips', () => {
    const legacy = core.ring.codec.decode('{"diameter":220,"bandWidth":18,"height":6,"cordClearance":3,"ledClearance":0.4,"channelDepth":1.5}');
    expect([legacy.segmented, legacy.diameter, legacy.jointFit, legacy.reflectedLED, legacy.stripWidth]).toEqual([false, 220, 0.3, false, 3.5]);
    const large = core.ring.presets.large;
    expect(core.ring.codec.decode(core.ring.codec.encode(large))).toEqual(large);
    const invalid = core.ring.normalize({ ...core.ring.defaults, diameter: NaN, bandWidth: -1, height: Infinity, cordClearance: 100, ledClearance: -1, channelDepth: 100 });
    expect([invalid.diameter, invalid.height, invalid.cordClearance, invalid.ledClearance, invalid.channelDepth]).toEqual([240, 6, 5, 0.2, 3]);
    expect(invalid.bandWidth).toBe(core.ring.derived(invalid).minimumBandWidth);
    expect(core.ring.codec.decode(core.ring.codec.encode(invalid))).toEqual(invalid);
    const split = core.ring.normalize({ ...core.ring.defaults, diameter: NaN, bandWidth: Infinity, height: NaN, cordClearance: NaN, ledClearance: NaN, channelDepth: NaN, segmented: true, jointFit: NaN });
    expect([split.diameter, split.bandWidth, split.height, split.cordClearance, split.jointFit]).toEqual([450, 24, 12, 6, 0.3]);
    const badLight = core.ring.normalize({ ...large, stripWidth: NaN, stripThickness: Infinity, bandWidth: NaN });
    expect([badLight.stripWidth, badLight.stripThickness, badLight.bandWidth]).toEqual([8, 3, 40]);
    const solidUplight = core.ring.normalize({ ...core.ring.presets.solid, height: NaN, cordClearance: NaN });
    expect([solidUplight.height, solidUplight.cordClearance]).toEqual([12, 6]);
  });

  it('basket: synthesized Codable needs every key', () => {
    const p = core.basket.defaults;
    expect(core.basket.codec.decode(core.basket.codec.encode(p))).toEqual(p);
    failsWith(() => core.basket.codec.decode('{"style":"wicker","width":64}'), 'invalid-settings', INVALID_SETTINGS_MESSAGE);
    expect(core.basket.match(p, core.balloon.defaults)).toEqual({ ...p, width: 63, depth: 49, height: 42 });
  });

  it('figure: defaults, normalization, partial and unknown files', () => {
    const d = core.figure.defaults;
    expect(d).toEqual({ style: 'star', height: 60, surface: 'pillow', edge: 1.6, dome: 3.2, doubleSided: false, holeDiameter: 2, holeMargin: 2.5, chainHole: false });
    expect(core.figure.codec.decode(core.figure.codec.encode(d))).toEqual(d);
    const fixed = core.figure.normalize({ ...d, height: 500, edge: NaN, dome: 0, holeDiameter: -1, holeMargin: 99, surface: 'flat', doubleSided: true });
    expect([fixed.height, fixed.edge, fixed.dome, fixed.holeDiameter, fixed.holeMargin, fixed.doubleSided]).toEqual([120, 1.6, 0.8, 1.5, 6, false]);
    expect(core.figure.normalize(fixed)).toEqual(fixed);
    const partial = core.figure.codec.decode('{"style":"moon","height":75}');
    expect([partial.style, partial.height, partial.surface, partial.edge]).toEqual(['moon', 75, 'pillow', 1.6]);
    const unknown = core.figure.codec.decode('{"style":"dragon","surface":"velvet"}');
    expect([unknown.style, unknown.surface]).toEqual(['star', 'pillow']);
  });

  it('clip: defaults, normalization, partial, unknown and 1.28 files', () => {
    const d = core.clip.defaults;
    expect(core.clip.codec.decode(core.clip.codec.encode(d))).toEqual(d);
    const fixed = core.clip.normalize({ ...d, cableDiameter: 50, nailDiameter: -1, nailHeadDiameter: 99, nailHeadHeight: 0, nailGap: 99, plate: 0, length: 1, wall: 9, overlap: NaN });
    expect(fixed).toEqual({ ...d, cableDiameter: 6, nailDiameter: 1, nailHeadDiameter: 8, nailHeadHeight: 0.3, nailGap: 10, plate: 1.2, length: 4, wall: 1.2, overlap: 0.5 });
    expect(core.clip.normalize(fixed)).toEqual(fixed);
    const partial = core.clip.codec.decode('{"cableDiameter":4,"mount":"adhesive"}');
    expect([partial.cableDiameter, partial.mount, partial.length, partial.overlap, partial.plate]).toEqual([4, 'adhesive', 6, 0.5, 2]);
    expect(core.clip.codec.decode('{"mount":"velcro"}').mount).toBe('nail');
    const old = core.clip.normalize(core.clip.codec.decode('{"cableDiameter":3.75,"grip":0.4,"nailDiameter":1.4,"length":8,"wall":1.6,"hookDepth":0.5,"play":0.2,"rail":true,"railLength":20}'));
    expect([old.nailDiameter, old.length, old.wall, old.overlap]).toEqual([1.4, 8, 1.2, 0.5]);
  });
});
