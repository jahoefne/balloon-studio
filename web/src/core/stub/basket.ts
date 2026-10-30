// Ported from mac/Sources/BalloonStudio/BasketGeometry.swift:19-44 and BasketEditor.swift:50-56 @ 03c9307.

import type { BasketDerived, BasketParameterApi } from '../api';
import { BASKET_STYLES, type BalloonParameters, type BasketParameters } from '../types';
import { keyedCodec } from '../codec';
import type { JSONKeyedContainer } from '../swift/json';
import { swiftMax, swiftMin } from '../swift/minmax';
import { intTrunc, rounded } from '../swift/rounding';

const defaults: BasketParameters = Object.freeze({
  style: 'wicker',
  width: 64,
  depth: 48,
  height: 42,
  wallThickness: 2.4,
  cordClearance: 3,
  texture: 0.7,
});

const actualDepth = (p: BasketParameters): number => (p.style === 'ribbed' ? p.width : p.depth);

export const basketFilename = (p: BasketParameters): string =>
  `Basket-${p.style}-${intTrunc(p.width)}x${intTrunc(actualDepth(p))}x${intTrunc(p.height)}mm.stl`;

const derived = (p: BasketParameters): BasketDerived => ({
  actualDepth: actualDepth(p),
  floorThickness: swiftMax(2.4, p.wallThickness),
  holeCenter: p.height - swiftMax(3, p.wallThickness * 1.5) - p.cordClearance / Math.sqrt(2),
  filename: basketFilename(p),
});

export const normalizeBasket = (input: BasketParameters): BasketParameters => {
  const clamp = (value: number, low: number, high: number, fallback: number): number =>
    Number.isFinite(value) ? swiftMax(low, swiftMin(high, value)) : fallback;
  return {
    ...input,
    width: clamp(input.width, 40, 100, 64),
    depth: clamp(input.depth, 30, 90, 48),
    height: clamp(input.height, 24, 70, 42),
    wallThickness: clamp(input.wallThickness, 1.6, 3.2, 2.4),
    cordClearance: clamp(input.cordClearance, 2, 5, 3),
    texture: clamp(input.texture, 0, 1, 0.7),
  };
};

/** Synthesized Codable: every key is required. */
const decode = (c: JSONKeyedContainer): BasketParameters => {
  return {
    style: c.enumeration('style', BASKET_STYLES),
    width: c.double('width'),
    depth: c.double('depth'),
    height: c.double('height'),
    wallThickness: c.double('wallThickness'),
    cordClearance: c.double('cordClearance'),
    texture: c.double('texture'),
  };
};

export const basketParameters: BasketParameterApi = {
  defaults,
  normalize: normalizeBasket,
  codec: keyedCodec(decode),
  filename: basketFilename,
  derived,
  match: (p: BasketParameters, balloon: BalloonParameters): BasketParameters => ({
    ...p,
    width: rounded(balloon.diameter * 0.35),
    depth: rounded(balloon.diameter * 0.27),
    height: rounded(balloon.height * 0.19),
  }),
};
