// Ported from mac/Tests/GeometryTests.swift:58-79 (basket loop), mac/Tests/BasketHoleTests.swift and
// mac/Tests/WickerTests.swift:32-87 @ cbda68d. basketSection/basketRadius (WickerTests:6-31) are in
// core/testing. The Swift tests' `data.write` and `print` lines have no port.
//
// The normalization and codec tables at the end have no Swift counterpart: Swift relies on the
// synthesized Codable, which the port has to spell out (table measured with JSONDecoder).
import { describe, expect, it } from 'vitest';
import {
  actualDepth,
  basketCodec,
  basketDefaults,
  basketFilename,
  BasketGenerator,
  floorThickness,
  holeCenter,
  normalizedBasket,
  type BasketQuality,
} from '../src/core/basket/basketGeometry';
import { CoreFailure } from '../src/core/api';
import { BalloonMesh } from '../src/core/geometry/mesh';
import { add, scale, type Point3 } from '../src/core/geometry/point3';
import { binarySTL } from '../src/core/io/binaryStl';
import { atan2, cos, PI, sin } from '../src/core/swift/dmath';
import { arrayMax, arrayMin } from '../src/core/swift/minmax';
import { rounded } from '../src/core/swift/rounding';
import { basketRadius, basketSection } from '../src/core/testing/basket';
import { check } from '../src/core/testing/check';
import { ray } from '../src/core/testing/ray';
import { parseSTL } from '../src/core/testing/stl';
import { BASKET_STYLES, BASKET_STYLE_INFO, type BasketParameters } from '../src/core/types';

const basket = (fields: Partial<BasketParameters>): BasketParameters => ({ ...basketDefaults(), ...fields });

/** Swift `ray(…)!`. */
function hit(mesh: BalloonMesh, o: Point3, d: Point3, message: string): [number, Point3] {
  const result = ray(mesh, o, d);
  check(result !== undefined, message);
  return result;
}

/** BasketHoleTests.swift:4-37 */
function checkBasketHoles(mesh: BalloonMesh, p: BasketParameters): void {
  const radius = p.cordClearance / 2;
  const mouth = radius + 0.35;
  const center_ = holeCenter(p);
  // Restrict ray checks to the attachment band; the woven wall is unrelated.
  const band = new BalloonMesh(
    mesh.vertices,
    mesh.triangles.filter((t) => {
      const heights = [(mesh.vertices[t.a] as Point3).z, (mesh.vertices[t.b] as Point3).z, (mesh.vertices[t.c] as Point3).z];
      return (arrayMin(heights) as number) <= center_ + mouth + 0.1 && (arrayMax(heights) as number) >= center_ - mouth - 0.1;
    }),
    0,
  );
  for (let side = 0; side < 4; side++) {
    const theta = side * PI / 2;
    const normal: Point3 = { x: cos(theta), y: sin(theta), z: 0 };
    const tangent: Point3 = { x: -sin(theta), y: cos(theta), z: 0 };
    const center: Point3 = { x: 0, y: 0, z: center_ };
    check(ray(band, center, normal) === undefined, 'Basket cord hole center is obstructed');
    for (let sample = 0; sample < 32; sample++) {
      // Include directions between the modeled circular contour's nodes.
      const angle = 2 * PI * (sample + 0.25) / 32;
      const direction = add(scale(tangent, cos(angle)), { x: 0, y: 0, z: sin(angle) });
      check(ray(band, add(center, scale(direction, radius - 0.0001)), normal) === undefined, 'Basket cord bore is narrower than its selected clearance');
      check(ray(band, add(center, scale(direction, radius + 0.02)), normal) !== undefined, 'Basket cord bore is not round or is oversized');
      // Both mouths must be wider than the throat, while a little
      // farther out the ray should meet the original basket wall.
      const inBevel = add(center, scale(direction, radius + 0.17));
      const outsideMouth = add(center, scale(direction, mouth + 0.05));
      const innerBevel = hit(band, inBevel, normal, 'Missing inner bevel');
      const innerWall = hit(band, outsideMouth, normal, 'Missing inner wall');
      const outerBevel = hit(band, add(inBevel, scale(normal, 150)), scale(normal, -1), 'Missing outer bevel');
      const outerWall = hit(band, add(outsideMouth, scale(normal, 150)), scale(normal, -1), 'Missing outer wall');
      check(innerBevel[0] > innerWall[0] + 0.04 && outerBevel[0] > outerWall[0] + 0.04, 'Cord mouths must have a bevel on both sides');
    }
  }
}

const QUALITIES: readonly BasketQuality[] = ['preview', 'export'];

/** GeometryTests.swift:58-79 */
describe('basket', () => {
  for (const style of BASKET_STYLES) {
    const inputs: [string, BasketParameters][] = [
      ['default', basket({ style })],
      ['small', basket({ style, width: 40, depth: 30, height: 24, wallThickness: 3.2, cordClearance: 5, texture: 1 })],
      ['large', basket({ style, width: 100, depth: 90, height: 70, wallThickness: 1.6, cordClearance: 2, texture: 0 })],
    ];
    for (const [name, input] of inputs) {
      it(`${BASKET_STYLE_INFO[style].title} ${name}: four round beveled holes, clear bores, connected watertight mesh, correct dimensions`, () => {
        const p = normalizedBasket(input);
        const preview = BasketGenerator.generate(p);
        preview.validate();
        checkBasketHoles(preview, p);
        const mesh = BasketGenerator.generate(p, 'export');
        const data = binarySTL(mesh);
        const parsed = parseSTL(data);
        parsed.validate();
        checkBasketHoles(parsed, p);
        const dims = parsed.dimensions;
        check(Math.abs(dims.x - p.width) < 0.001 && Math.abs(dims.y - actualDepth(p)) < 0.001 && Math.abs(dims.z - p.height) < 0.001, 'Basket dimensions changed');
        check(parsed.vertices.length - parsed.triangles.length / 2 === -6, 'Basket must have exactly four through-holes');
        check(parsed.vertices.every((v) => v.z >= 0), 'Basket below bed');
      }, 300_000);
    }
  }
});

/** WickerTests.swift:32-87 */
describe('wicker', () => {
  it('alternating reeds, detailed wall beneath holes, continuous seam; preview and export agree; zero detail', () => {
    const p = basket({ texture: 1 });
    const corner = p.depth * 0.16;
    const perimeter = 2 * (p.width + p.depth) - 8 * corner + 2 * PI * corner;
    const pitch = perimeter / (rounded(perimeter / 3.6 / 4) * 4);
    const samples: number[][] = [];
    for (const quality of QUALITIES) {
      const mesh = BasketGenerator.generate(p, quality);
      mesh.validate();
      const sections = new Map<number, [Point3, Point3][]>();
      const relief = (y: number, z: number): number => {
        const theta = atan2(y, p.width / 2);
        let section = sections.get(z);
        if (section === undefined) {
          section = basketSection(mesh, z);
          sections.set(z, section);
        }
        const base = p.width / 2 * (0.86 + 0.14 * z / p.height) / cos(theta);
        return basketRadius(section, theta) - base;
      };
      // One reed goes over at one row, under at the next; the crossing
      // vertical reed alternates the other way on neighboring columns.
      const hUnder = relief(pitch * 0.35, 12.017);
      const hOver = relief(pitch * 0.35, 14.417);
      const vOver = relief(0, 12.857);
      const vUnder = relief(pitch, 12.857);
      check(hOver - hUnder > 0.18, 'Horizontal reeds lost their alternating crossings');
      check(vOver - vUnder > 0.18, 'Vertical reeds lost their alternating crossings');
      // The old hole layout left a broad, flat strip along this seam.
      const section = basketSection(mesh, 13.217);
      const seam = basketRadius(section, 0);
      const left = basketRadius(section, 2 * PI - 0.001);
      const right = basketRadius(section, 0.001);
      check(Math.abs(left - right) < 0.015 && Math.abs(seam - (left + right) / 2) < 0.015, 'Wicker has a visible wrap seam');
      const profile: number[] = [];
      for (let i = 0; i <= 40; i++) profile.push(relief(i * pitch / 40, 12.857));
      check((arrayMax(profile) as number) - (arrayMin(profile) as number) > 0.35, 'Fine weave disappeared below the cord hole');
      samples.push(profile);
    }
    const [previewProfile, exportProfile] = samples as [number[], number[]];
    check(previewProfile.every((value, i) => Math.abs(value - (exportProfile[i] as number)) < 0.13), 'Preview and export weave diverge');
    const flat = basket({ texture: 0 });
    const smooth = BasketGenerator.generate(flat);
    const section = basketSection(smooth, 12.857);
    check(Math.abs(basketRadius(section, 0) - flat.width / 2 * (0.86 + 0.14 * 12.857 / flat.height)) < 0.001, 'Zero detail must leave a smooth wall');
  }, 300_000);

  // Exercise the dense-to-hole-band transition and STL precision at the
  // largest relief, thin walls, and strongly rectangular outlines.
  const extremes: [string, BasketParameters][] = [
    ['wide', basket({ width: 100, depth: 30, height: 70, wallThickness: 1.6, cordClearance: 5, texture: 1 })],
    ['deep', basket({ width: 40, depth: 90, height: 24, wallThickness: 1.6, cordClearance: 5, texture: 1 })],
  ];
  for (const [name, input] of extremes) {
    for (const quality of QUALITIES) {
      it(`${name} ${quality}: thin walls and rectangular extremes`, () => {
        const mesh = BasketGenerator.generate(input, quality);
        const data = binarySTL(mesh);
        const parsed = parseSTL(data);
        parsed.validate();
        check(parsed.vertices.length - parsed.triangles.length / 2 === -6, 'Wicker transition changed the four cord holes');
        checkBasketHoles(parsed, input);
        const dims = parsed.dimensions;
        check(Math.abs(dims.x - input.width) < 0.001 && Math.abs(dims.y - input.depth) < 0.001 && Math.abs(dims.z - input.height) < 0.001, 'Detailed wicker exceeded its dimensions');
      }, 300_000);
    }
  }
});

describe('BasketParameters', () => {
  it('derives depth, floor, hole center and filename like the Swift computed properties', () => {
    const p = basketDefaults();
    expect(actualDepth(p)).toBe(48);
    expect(actualDepth({ ...p, style: 'ribbed' })).toBe(64);
    expect(floorThickness(p)).toBe(2.4);
    expect(floorThickness({ ...p, wallThickness: 3.2 })).toBe(3.2);
    expect(holeCenter(p)).toBe(42 - 3.5999999999999996 - 3 / Math.sqrt(2));
    expect(basketFilename(p)).toBe('Basket-wicker-64x48x42mm.stl');
    expect(basketFilename({ ...p, style: 'ribbed', width: 64.9, height: 42.5 })).toBe('Basket-ribbed-64x64x42mm.stl');
  });

  it('clamps to the ranges of normalized() and replaces non-finite values by the defaults', () => {
    const low = normalizedBasket({ style: 'voyager', width: 1, depth: 1, height: 1, wallThickness: 1, cordClearance: 1, texture: -1 });
    expect(low).toEqual({ style: 'voyager', width: 40, depth: 30, height: 24, wallThickness: 1.6, cordClearance: 2, texture: 0 });
    const high = normalizedBasket({ style: 'ribbed', width: 900, depth: 900, height: 900, wallThickness: 9, cordClearance: 9, texture: 9 });
    expect(high).toEqual({ style: 'ribbed', width: 100, depth: 90, height: 70, wallThickness: 3.2, cordClearance: 5, texture: 1 });
    const bad = normalizedBasket({ style: 'wicker', width: NaN, depth: Infinity, height: -Infinity, wallThickness: NaN, cordClearance: NaN, texture: NaN });
    expect(bad).toEqual(basketDefaults());
  });

  const MISSING = 'The data couldn’t be read because it is missing.';
  const FORMAT = 'The data couldn’t be read because it isn’t in the correct format.';
  const fields = '"width":64,"depth":48,"height":42,"wallThickness":2.4,"cordClearance":3,"texture":0.7';

  it.each([
    ['partial settings', '{"style":"ribbed"}', MISSING],
    ['no style', `{${fields}}`, MISSING],
    ['null style', `{"style":null,${fields}}`, MISSING],
    ['null number', '{"style":"wicker","width":null,"depth":48,"height":42,"wallThickness":2.4,"cordClearance":3,"texture":0.7}', MISSING],
    ['null document', 'null', MISSING],
    ['unknown style', `{"style":"round",${fields}}`, FORMAT],
    ['unknown style before a missing key', '{"style":"round"}', FORMAT],
    ['number as style', `{"style":1,${fields}}`, FORMAT],
    ['string as number', '{"style":"wicker","width":"64","depth":48,"height":42,"wallThickness":2.4,"cordClearance":3,"texture":0.7}', FORMAT],
    ['bool as number', '{"style":"wicker","width":true,"depth":48,"height":42,"wallThickness":2.4,"cordClearance":3,"texture":0.7}', FORMAT],
    ['overflowing literal', '{"style":"wicker","width":1e999,"depth":48,"height":42,"wallThickness":2.4,"cordClearance":3,"texture":0.7}', FORMAT],
    ['array', '[1]', FORMAT],
    ['number', '1', FORMAT],
    ['string', '"x"', FORMAT],
    ['syntax error', '{', FORMAT],
    ['empty', '', FORMAT],
    ['comment', `// c\n{"style":"wicker",${fields}}`, FORMAT],
    ['NaN', '{"style":"wicker","width":NaN,"depth":48,"height":42,"wallThickness":2.4,"cordClearance":3,"texture":0.7}', FORMAT],
  ])('rejects %s like JSONDecoder', (_name, text, message) => {
    let failure: unknown;
    try {
      basketCodec.decode(text);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CoreFailure);
    expect((failure as CoreFailure).code).toBe('invalid-settings');
    expect((failure as CoreFailure).message).toBe(message);
  });

  it('decodes without normalizing, ignores unknown keys, keeps -0', () => {
    expect(basketCodec.decode(`{"style":"wicker","extra":[1],${fields}}`)).toEqual(basketDefaults());
    const raw = basketCodec.decode('{"style":"ribbed","width":-0,"depth":900,"height":42,"wallThickness":2.4,"cordClearance":3,"texture":0.7}');
    expect(Object.is(raw.width, -0)).toBe(true);
    expect(raw.depth).toBe(900);
  });

  it('encodes with sorted keys like JSONEncoder and round-trips', () => {
    const text = basketCodec.encode(basketDefaults());
    expect(text).toBe('{"cordClearance":3,"depth":48,"height":42,"style":"wicker","texture":0.7,"wallThickness":2.4,"width":64}');
    expect(basketCodec.decode(text)).toEqual(basketDefaults());
  });
});
