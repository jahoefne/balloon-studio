// Export filenames per part against the Swift rules: BalloonGeometry.swift:40-43,
// BalloonStudioApp.swift:169-170, BasketGeometry.swift:30, RingGeometry.swift:60-64,
// CloudGeometry.swift:240-247, FigureGeometry.swift:221-228, CableClip.swift:85-87.

import { describe, expect, it } from 'vitest';
import type { CloudParameters } from '../types';
import { core } from './index';

describe('balloon', () => {
  const classic = core.balloon.defaults;
  it.each([
    [{}, 'Balloon-180x220mm-20panels.stl'],
    [{ panels: 16, hollow: true, stringHoles: true, hangingLoop: true }, 'Balloon-180x220mm-16panels-hollow-1.2mm-tethers-hanger.stl'],
    [{ hollow: true, wallThickness: 0.8 }, 'Balloon-180x220mm-20panels-hollow-0.8mm.stl'],
    // %.1f rounds the exact binary value, exact ties to even.
    [{ hollow: true, wallThickness: 1.25 }, 'Balloon-180x220mm-20panels-hollow-1.2mm.stl'],
    [{ hollow: true, wallThickness: 2.25 }, 'Balloon-180x220mm-20panels-hollow-2.2mm.stl'],
    [{ hollow: true, wallThickness: 1.35 }, 'Balloon-180x220mm-20panels-hollow-1.4mm.stl'],
    [{ hollow: true, wallThickness: 0.85 }, 'Balloon-180x220mm-20panels-hollow-0.8mm.stl'],
    // Int() truncates.
    [{ diameter: 199.9, height: 244.6 }, 'Balloon-199x244mm-20panels.stl'],
    [{ stringHoles: true }, 'Balloon-180x220mm-20panels-tethers.stl'],
  ])('%j → %s', (change, name) => {
    expect(core.balloon.filename({ ...classic, ...change })).toBe(name);
    expect(core.balloon.derived({ ...classic, ...change }).filename).toBe(name);
  });

  it('names the 3MF after the pattern', () => {
    const snapshot = (style: Parameters<typeof core.balloon.exportFormat>[0]['style']) => ({
      parameters: { ...classic, hollow: true },
      pattern: { ...core.balloon.pattern.defaults, style },
      purge: core.balloon.purge.defaults,
    });
    expect(core.balloon.exportFilename(snapshot('Solid'))).toBe('Balloon-180x220mm-20panels-hollow-1.2mm.stl');
    expect(core.balloon.exportFilename(snapshot('Hearts'))).toBe('Balloon-180x220mm-20panels-hollow-1.2mm-pattern.3mf');
    expect(core.balloon.exportFilename(snapshot('Text'))).toBe('Balloon-180x220mm-20panels-hollow-1.2mm-pattern.3mf');
    expect(core.balloon.exportFilename(snapshot('Night Flight'))).toBe('Balloon-180x220mm-20panels-hollow-1.2mm-night-flight.3mf');
    expect(core.balloon.exportFilename(snapshot('Summit Cable Car'))).toBe('Balloon-180x220mm-20panels-hollow-1.2mm-summit-cable-car.3mf');
    // Any pattern but Solid exports a 3MF, even with one color twice.
    expect(core.balloon.exportFormat({ ...core.balloon.pattern.defaults, style: 'Polka dots', base: 'Sage', detail: 'Sage' })).toBe('3mf');
  });
});

describe('basket', () => {
  it.each([
    [{}, 'Basket-wicker-64x48x42mm.stl'],
    [{ style: 'ribbed' as const }, 'Basket-ribbed-64x64x42mm.stl'],
    [{ style: 'voyager' as const, width: 80.9, depth: 55.5, height: 30.2 }, 'Basket-voyager-80x55x30mm.stl'],
  ])('%j → %s', (change, name) => {
    expect(core.basket.filename({ ...core.basket.defaults, ...change })).toBe(name);
  });
});

describe('ring', () => {
  const { large, solid } = core.ring.presets;
  it.each([
    [core.ring.defaults, 'Mobile-Ring-240mm-3-balloons.stl'],
    [{ ...core.ring.defaults, segmented: true, diameter: 450 }, 'Mobile-Ring-450mm-6-section-kit.zip'],
    [large, 'Mobile-Ring-450mm-8mm-uplight-kit.zip'],
    [solid, 'Mobile-Ring-450mm-8mm-uplight-solid.stl'],
    [{ ...large, stripWidth: 3.75 }, 'Mobile-Ring-450mm-3.75mm-uplight-kit.zip'],
    [{ ...solid, diameter: 300.7, stripWidth: 12 }, 'Mobile-Ring-300mm-12mm-uplight-solid.stl'],
  ])('%j → %s', (p, name) => {
    expect(core.ring.filename(p)).toBe(name);
  });
});

describe('cloud and sun kits', () => {
  const cloud = core.cloud.defaults('cloud');
  const sun = core.cloud.defaults('sun');
  const sides = (p: CloudParameters, list: CloudParameters['cableSide'][]) => core.cloud.withCableSides(p, list);
  it.each<[CloudParameters, string]>([
    [cloud, 'Cloud-Lamp-230mm-kit.zip'],
    [sun, 'Sun-Lamp-soft-star-200mm-kit.zip'],
    [
      sides({ ...cloud, style: 'billow', mirrored: true, surface: 'sculpted', surfaceDepth: 18 }, ['left', 'top']),
      'Cloud-Lamp-billow-mirrored-230mm-3d-18.0mm-cable-left-top-kit.zip',
    ],
    [sides({ ...cloud, style: 'billow', mirrored: true }, ['top', 'left']), 'Cloud-Lamp-billow-mirrored-230mm-cable-left-top-kit.zip'],
    [{ ...cloud, mirrored: true }, 'Cloud-Lamp-classic-mirrored-230mm-kit.zip'],
    [{ ...cloud, style: 'cotton' }, 'Cloud-Lamp-cotton-230mm-kit.zip'],
    [{ ...cloud, cableSide: 'left' }, 'Cloud-Lamp-230mm-cable-left-kit.zip'],
    [{ ...cloud, cableSide: 'top' }, 'Cloud-Lamp-230mm-cable-top-kit.zip'],
    [{ ...cloud, cableSide: 'bottom' }, 'Cloud-Lamp-230mm-cable-bottom-kit.zip'],
    [sides(sun, ['top', 'right', 'bottom']), 'Sun-Lamp-soft-star-200mm-cable-bottom-right-top-kit.zip'],
    [sides({ ...sun, sunStyle: 'bold-eight' }, ['right', 'left', 'bottom', 'top']), 'Sun-Lamp-bold-eight-200mm-cable-bottom-left-right-top-kit.zip'],
    [{ ...sun, sunStyle: 'pinwheel', width: 499.99, surface: 'sculpted', surfaceDepth: 30 }, 'Sun-Lamp-pinwheel-499mm-3d-30.0mm-kit.zip'],
    [{ ...cloud, surface: 'sculpted', surfaceDepth: 2.25 }, 'Cloud-Lamp-230mm-3d-2.2mm-kit.zip'],
  ])('%#: %s', (p, name) => {
    expect(core.cloud.filename(p)).toBe(name);
    expect(core.cloud.derived(p).filename).toBe(name);
  });

  it('gives every set of outlets its own kit name (CableOutletTests:24)', () => {
    const names = new Set<string>();
    const all = ['left', 'right', 'top', 'bottom'] as const;
    for (let mask = 1; mask < 16; mask += 1) {
      const set = all.filter((_, i) => mask & (1 << i));
      if (set.length < 2) continue;
      names.add(core.cloud.filename(sides(cloud, set)));
    }
    expect(names.size).toBe(11);
  });

  it('names the front, display name and kit constants', () => {
    expect(core.cloud.derived(cloud).frontFilename).toBe('B-cloud-front-white-PLA.stl');
    expect(core.cloud.derived(sun).frontFilename).toBe('B-sun-front-diffuser.stl');
    expect(core.cloud.derived({ ...cloud, style: 'twin', mirrored: true }).displayName).toBe('Twin · mirrored');
    expect(core.cloud.derived({ ...sun, sunStyle: 'bold-eight' }).displayName).toBe('Sun · Bold eight');
    expect(core.cloud.constants).toMatchObject({
      sealFilename: 'C-cable-seal-TPU.stl',
      barFilename: 'D-cable-clamp-bar.stl',
      anvilFilename: 'E-cable-clamp-anvil.stl',
      insertFilename: 'F-nail-slot-insert.stl',
    });
  });
});

describe('figures', () => {
  const d = core.figure.defaults;
  it.each([
    [{}, 'Mobile-Figure-star-60mm.stl', 'Mobile-Figures-60mm-set.zip'],
    [{ style: 'heart' as const, height: 75, surface: 'puffy' as const, doubleSided: true, chainHole: true }, 'Mobile-Figure-heart-75mm-puffy-two-sided-chain.stl', 'Mobile-Figures-75mm-puffy-two-sided-chain-set.zip'],
    // A flat figure has one side, whatever doubleSided says.
    [{ style: 'moon' as const, surface: 'flat' as const, doubleSided: true }, 'Mobile-Figure-moon-60mm-flat.stl', 'Mobile-Figures-60mm-flat-set.zip'],
    // Int(height.rounded()): halves away from zero.
    [{ style: 'raindrop' as const, height: 60.5, chainHole: true }, 'Mobile-Figure-raindrop-61mm-chain.stl', 'Mobile-Figures-61mm-chain-set.zip'],
    [{ style: 'balloon' as const, height: 59.49 }, 'Mobile-Figure-balloon-59mm.stl', 'Mobile-Figures-59mm-set.zip'],
  ])('%j → %s', (change, name, setName) => {
    expect(core.figure.filename({ ...d, ...change })).toBe(name);
    expect(core.figure.setFilename({ ...d, ...change })).toBe(setName);
  });

  it('gives every style and variant its own name (FigureTests:25-34)', () => {
    const names = new Set<string>();
    for (const style of ['balloon', 'cloud', 'star', 'moon', 'sun', 'heart', 'raindrop'] as const) {
      const p = { ...d, style };
      names.add(core.figure.filename(p));
      const variants = [p, { ...p, surface: 'flat' as const }, { ...p, doubleSided: true }, { ...p, chainHole: true }];
      expect(new Set(variants.map((q) => core.figure.filename(q))).size).toBe(4);
      expect(core.figure.setFilename(p)).toBe(core.figure.setFilename(d));
    }
    expect(names.size).toBe(7);
    expect(core.figure.derived(d).displayName).toBe('Star · 60 mm');
  });
});

describe('cable clip', () => {
  const d = core.clip.defaults;
  it.each([
    [{}, 'Cable-Clip-3.75mm.stl'],
    [{ mount: 'adhesive' as const }, 'Cable-Clip-3.75mm-adhesive.stl'],
    [{ flat: true }, 'Cable-Clip-3.75mm-flat.stl'],
    [{ cableDiameter: 4 }, 'Cable-Clip-4mm.stl'],
    [{ cableDiameter: 2.5, mount: 'adhesive' as const, flat: true }, 'Cable-Clip-2.5mm-adhesive-flat.stl'],
    // %g keeps six significant digits.
    [{ cableDiameter: 3.1415926 }, 'Cable-Clip-3.14159mm.stl'],
  ])('%j → %s', (change, name) => {
    expect(core.clip.filename({ ...d, ...change })).toBe(name);
  });

  it('shows the cable in the display name', () => {
    expect(core.clip.names(d)).toEqual({ cableText: '3.75', displayName: 'Cable clip · Ø 3.75 mm', filename: 'Cable-Clip-3.75mm.stl' });
  });
});
