import { describe, expect, it } from 'vitest';
import { frame, needsReframe, type FramingInput, type ReframeState } from './framing';

// Expected numbers worked out by hand from BalloonPreview.swift:155-188.
const base: FramingInput = {
  height: 100,
  neck: 32,
  opening: false,
  compact: false,
  width: 80,
  top: false,
  neckHeight: 12,
  filledNeck: false,
  topDown: false,
};
const yUp = { x: 0, y: 1, z: 0 };

describe('frame', () => {
  it('default: fixed corner view, scale floored at 145', () => {
    expect(frame(base)).toEqual({
      position: { x: 340, y: 260, z: 490 }, // 100*0.5+210
      target: { x: 0, y: 48, z: 0 }, // 100*0.48
      orthographicScale: 145, // max(145, 72)
      up: yUp,
    });
  });

  it('default: a tall object outgrows the floor', () => {
    const framing = frame({ ...base, height: 250 });
    expect(framing.position).toEqual({ x: 340, y: 335, z: 490 });
    expect(framing.target).toEqual({ x: 0, y: 120, z: 0 });
    expect(framing.orthographicScale).toBeCloseTo(180, 12); // 250*0.72
  });

  it('opening: from below, at the origin, scaled by the neck', () => {
    expect(frame({ ...base, opening: true })).toEqual({
      position: { x: 35, y: -160, z: 80 },
      target: { x: 0, y: 0, z: 0 },
      orthographicScale: 24, // max(24, 22.4)
      up: yUp,
    });
    expect(frame({ ...base, opening: true, neck: 60 }).orthographicScale).toBeCloseTo(42, 12); // 60*0.7
  });

  it('filled neck: level with the middle of the neck, keeps the opening scale', () => {
    expect(frame({ ...base, opening: true, filledNeck: true })).toEqual({
      position: { x: 0, y: 6, z: 80 },
      target: { x: 0, y: 6, z: 0 },
      orthographicScale: 24,
      up: yUp,
    });
  });

  it('filled neck only counts while inspecting the opening', () => {
    expect(frame({ ...base, filledNeck: true })).toEqual(frame(base));
  });

  it('compact: taller than 10 % of its width, keeps the default target', () => {
    const framing = frame({ ...base, compact: true, height: 60, width: 100 });
    expect(framing.position).toEqual({ x: 200, y: 180, z: 240 }); // w*2, 60+100*1.2, w*2.4
    expect(framing.target.y).toBeCloseTo(28.8, 12); // 60*0.48
    expect(framing.orthographicScale).toBeCloseTo(62, 12); // max(32, max(62, 54))
    expect(framing.up).toEqual(yUp);
  });

  it('compact: height wins the scale, minimum scale floors it', () => {
    expect(frame({ ...base, compact: true, height: 100, width: 50 }).orthographicScale).toBeCloseTo(90, 12); // 100*0.9
    expect(frame({ ...base, compact: true, height: 10, width: 10 }).orthographicScale).toBe(32);
    expect(frame({ ...base, compact: true, height: 10, width: 10, minimumScale: 9 }).orthographicScale).toBeCloseTo(9, 12);
  });

  it('compact: a flat object is seen steeper and fills the frame', () => {
    const framing = frame({ ...base, compact: true, height: 9, width: 100 });
    expect(framing.position).toEqual({ x: 200, y: 259, z: 240 }); // 9+100*2.5
    expect(framing.orthographicScale).toBe(50); // 100*0.5, no minimum scale
    // The flat test is strict: exactly 10 % is not flat.
    expect(frame({ ...base, compact: true, height: 10, width: 100 }).orthographicScale).toBeCloseTo(62, 12);
  });

  it('hanger: close-up of the top, overrides the compact scale', () => {
    const expected = {
      position: { x: 18, y: 105, z: 65 },
      target: { x: 0, y: 94, z: 0 },
      orthographicScale: 19,
      up: yUp,
    };
    expect(frame({ ...base, top: true })).toEqual(expected);
    expect(frame({ ...base, top: true, compact: true })).toEqual(expected);
  });

  it('top down: from straight above, screen top toward −z', () => {
    expect(frame({ ...base, compact: true, topDown: true })).toEqual({
      position: { x: 0, y: 260, z: 0 }, // 100+80*2
      target: { x: 0, y: 50, z: 0 },
      orthographicScale: 49.6, // max(32, 80*0.62)
      up: { x: 0, y: 0, z: -1 },
    });
    expect(frame({ ...base, topDown: true, width: 20, minimumScale: 40 }).orthographicScale).toBe(40);
  });

  it('branches run in Swift order: top down beats hanger beats filled neck', () => {
    const all = { ...base, opening: true, filledNeck: true, compact: true, top: true };
    expect(frame(all).target).toEqual({ x: 0, y: 94, z: 0 });
    expect(frame({ ...all, topDown: true }).target).toEqual({ x: 0, y: 50, z: 0 });
  });

  it('opening keeps its own target when compact moves the camera', () => {
    const framing = frame({ ...base, opening: true, compact: true, height: 60, width: 100 });
    expect(framing.target).toEqual({ x: 0, y: 0, z: 0 });
    expect(framing.position).toEqual({ x: 200, y: 180, z: 240 });
  });
});

describe('needsReframe', () => {
  const state: ReframeState = { resetCamera: 0, inspectOpening: false, inspectTop: false, topDown: false, filledNeck: false };

  it('frames the first time', () => {
    expect(needsReframe(null, state)).toBe(true);
  });

  it('holds still when nothing changed', () => {
    expect(needsReframe(state, { ...state })).toBe(false);
  });

  it.each([
    ['resetCamera', { resetCamera: 1 }],
    ['inspectOpening', { inspectOpening: true }],
    ['inspectTop', { inspectTop: true }],
    ['topDown', { topDown: true }],
  ])('frames when %s changes', (_name, change) => {
    expect(needsReframe(state, { ...state, ...change })).toBe(true);
  });

  it('a filled neck only frames while inspecting the opening', () => {
    expect(needsReframe(state, { ...state, filledNeck: true })).toBe(false);
    const opening = { ...state, inspectOpening: true };
    expect(needsReframe(opening, { ...opening, filledNeck: true })).toBe(true);
  });
});
