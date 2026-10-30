import { describe, expect, it } from 'vitest';
import { core } from '#core';
import type { CloudParameters, CloudPreview, CloudView } from '../../core/types';
import { calibrated } from '../../preview/colors';
import { CLAMP_COLOR, cableExitNote, exportPartCount, exportRequest, list, noClampNote, viewCaption, viewStyle } from './presentation';

const cloud = (change: Partial<CloudParameters> = {}): CloudParameters => core.cloud.normalize({ ...core.cloud.defaults('cloud'), ...change });
const sun = (change: Partial<CloudParameters> = {}): CloudParameters => core.cloud.normalize({ ...core.cloud.defaults('sun'), ...change });
const kit = (p: CloudParameters, change: Partial<CloudPreview> = {}): CloudPreview => ({ ...core.cloud.preview(p), ...change });

describe('export panel (CloudEditor.swift:94-100)', () => {
  it('names the kit per kind', () => {
    expect(exportRequest(cloud())).toMatchObject({ title: 'Export Cloud Lamp Kit', prompt: 'Export Kit', suggestedName: 'Cloud-Lamp-230mm-kit.zip' });
    expect(exportRequest(sun())).toMatchObject({ title: 'Export Sun Lamp Kit', prompt: 'Export Kit', suggestedName: 'Sun-Lamp-soft-star-200mm-kit.zip' });
  });

  it('counts 2 + outlets + 2 per clamp + insert', () => {
    const one = cloud();
    expect(exportPartCount(cloud({ strainRelief: false }))).toBe(3);
    expect(exportPartCount(one)).toBe(5);
    const three = core.cloud.setCableOutletCount(cloud({ strainRelief: false }), 3);
    expect(exportPartCount(three)).toBe(5);
    expect(exportPartCount(core.cloud.setCableOutletCount(one, 2))).toBe(8);
    expect(exportPartCount(cloud({ strainRelief: false, nailInsert: true }))).toBe(4);
    // A nail too thick for the slot brings no insert.
    expect(exportPartCount(cloud({ strainRelief: false, nailInsert: true, nailDiameter: 4 }))).toBe(3);
  });

  it('warns about the bed in the message', () => {
    expect(exportRequest(cloud()).message).toBe('5 print-ready STLs, a full-size LED placement plan, cut list and assembly notes.');
    expect(exportRequest(cloud({ width: 241 })).message).toBe('5 print-ready STLs, a full-size LED placement plan, cut list and assembly notes. This width exceeds the P2S bed with a brim.');
  });
});

describe('notes', () => {
  it('list joins like Swift', () => {
    expect(list([])).toBe('');
    expect(list(['Left'])).toBe('Left');
    expect(list(['Left', 'Top'])).toBe('Left and Top');
    expect(list(['Left', 'Top', 'Right'])).toBe('Left, Top and Right');
  });

  it('cableExitNote follows kind and side', () => {
    const end = ' The recessed keyhole has a solid cap, and the back sits flat on the wall.';
    expect(cableExitNote(cloud())).toBe(`Left and right are as you face the lamp: the cable leaves at the widest point.${end}`);
    expect(cableExitNote(sun())).toBe(`Left and right are as you face the lamp: the cable leaves between two rays, just below the horizontal one.${end}`);
    expect(cableExitNote(sun({ cableSide: 'left' }))).toBe(`Left and right are as you face the lamp: the cable leaves between two rays, just above the horizontal one.${end}`);
    expect(cableExitNote(cloud({ cableSide: 'top' }))).toBe(`The cable leaves at the highest point of the cloud.${end}`);
    expect(cableExitNote(sun({ cableSide: 'top' }))).toBe(`The cable leaves upwards, between two rays, just right of the vertical one.${end}`);
    expect(cableExitNote(cloud({ cableSide: 'bottom' }))).toBe(`The cable leaves straight down, in the middle of the flat base.${end}`);
    expect(cableExitNote(sun({ cableSide: 'bottom' }))).toBe(`The cable leaves downwards, between two rays, just left of the vertical one.${end}`);
    expect(cableExitNote(core.cloud.setCableOutletCount(cloud(), 3))).toBe('Cable exits: Right, Left and Bottom. Left and right are as you face the lamp. The back sits flat on the wall.');
  });

  it('noClampNote names the outlets without a clamp', () => {
    const two = core.cloud.setCableOutletCount(cloud(), 2);
    expect(noClampNote(two, ['left'])).toBe('No room for a clamp at Left. This outlet keeps its seal; secure its lead outside the lamp.');
    const three = core.cloud.setCableOutletCount(cloud(), 3);
    expect(noClampNote(three, ['left', 'bottom'])).toBe('No room for a clamp at Left and Bottom. These outlets keep their seals; secure their leads outside the lamp.');
  });

  it('noClampNote says what would give a single outlet its clamp', () => {
    const start = 'No room for the clamp behind this outlet: the nail pocket or the wall is too close. The kit comes without it.';
    const narrow = cloud({ width: 125 });
    const minimum = core.cloud.clampMinimumWidth(narrow);
    expect(minimum).not.toBeNull();
    expect(noClampNote(narrow, ['right']).startsWith(`${start} It fits with a width of ${minimum} mm or more`)).toBe(true);
  });
});

describe('caption (CloudEditor.swift:418)', () => {
  const caption = (view: CloudView, p: CloudParameters, change: Partial<CloudPreview> = {}) => viewCaption(view, kit(p, change));

  it('counts parts and screws in the exploded view', () => {
    expect(caption('exploded', cloud(), { printedParts: 5, clampCount: 1 })).toBe('5 printed parts · four hidden clips · 2 screws');
    expect(caption('exploded', cloud(), { printedParts: 3, clampCount: 0 })).toBe('3 printed parts · four hidden clips');
  });

  it('names the wall side', () => {
    const p = core.cloud.setCableOutletCount(cloud(), 2);
    expect(caption('rear', p, { hasInsertMesh: false })).toBe('Blind keyhole · closed floor · cable: Right + Left');
    expect(caption('rear', p, { hasInsertMesh: true })).toBe('Blind keyhole · closed floor · cable: Right + Left · blue: slot insert');
  });

  it('follows insert, clamp and surface', () => {
    expect(caption('insert', cloud(), { hasInsertMesh: true })).toBe('Flat face on the bed, fingers up · print solid');
    expect(caption('insert', cloud(), { hasInsertMesh: false })).toBe('No slot insert in this kit · showing the wall side');
    expect(caption('back', cloud(), { clampCount: 1 })).toBe('Green: LED guides · orange: seals · blue: clamps');
    expect(caption('back', cloud(), { clampCount: 0 })).toBe('Green: LED guides · orange: seals');
    expect(caption('seal', cloud())).toBe('Black TPU · flat end down, nozzle up · no supports');
    expect(caption('clamp', cloud(), { clampCount: 2 })).toBe('Bar on its side, anvil flat · 4 screws M3 × 10');
    expect(caption('clamp', cloud(), { clampCount: 0 })).toBe('No strain relief in this lamp · showing the seals');
    expect(caption('front', cloud())).toBe('Diffuser · flat face on the bed');
    expect(caption('front', cloud({ surface: 'sculpted' }))).toBe('Curved face up · clips down · supports required');
    expect(caption('assembled', cloud())).toBe('White diffuser · opaque backing');
    expect(caption('assembled', sun())).toBe('Warm diffuser · opaque backing');
    expect(caption('assembled', sun({ surface: 'sculpted' }))).toBe('Sculpted diffuser · opaque backing');
  });
});

describe('viewStyle (CloudEditor.swift:410-414)', () => {
  it('colors the body per view', () => {
    const p = cloud();
    const withClamp = kit(p, { clampCount: 1, hasInsertMesh: true });
    const without = kit(p, { clampCount: 0, hasInsertMesh: false });
    expect(viewStyle('front', p, withClamp).color).toEqual([0.96, 0.96, 0.96]);
    expect(viewStyle('front', cloud({ surface: 'sculpted' }), withClamp).color).toEqual([0.8, 0.8, 0.8]);
    expect(viewStyle('front', sun(), withClamp).color).toEqual(calibrated(1, 0.77, 0.25));
    expect(viewStyle('seal', p, withClamp).color).toEqual([0.2, 0.2, 0.2]);
    expect(viewStyle('clamp', p, withClamp).color).toEqual(CLAMP_COLOR);
    expect(viewStyle('clamp', p, without).color).toEqual([0.36, 0.36, 0.36]);
    expect(viewStyle('insert', p, withClamp).color).toEqual(CLAMP_COLOR);
    expect(viewStyle('insert', p, without).color).toEqual([0.36, 0.36, 0.36]);
    expect(viewStyle('exploded', p, withClamp).color).toEqual([0.36, 0.36, 0.36]);
  });

  it('gives the assembly views the diffuser as detail color, the others the guide green', () => {
    const p = sun();
    expect(viewStyle('exploded', p, null).detailColor).toEqual(calibrated(1, 0.77, 0.25));
    expect(viewStyle('assembled', p, null).detailColor).toEqual(calibrated(1, 0.77, 0.25));
    expect(viewStyle('back', p, null).detailColor).toEqual(calibrated(0.35, 0.65, 0.49));
  });

  it('frames small parts closer', () => {
    const p = cloud();
    expect(viewStyle('seal', p, null).minimumScale).toBe(9);
    expect(viewStyle('insert', p, kit(p, { hasInsertMesh: true })).minimumScale).toBe(12);
    expect(viewStyle('insert', p, kit(p, { hasInsertMesh: false })).minimumScale).toBe(32);
    expect(viewStyle('clamp', p, null).minimumScale).toBe(16);
    expect(viewStyle('front', p, null).minimumScale).toBe(32);
  });
});
