// The stub core's geometry half: placeholder meshes shaped by the real parameters, and
// exports with the real filenames and kit entry names. Nothing here is print-ready.

import type {
  BalloonGeometryApi,
  BasketGeometryApi,
  ClipGeometryApi,
  CloudGeometryApi,
  FigureGeometryApi,
  RingGeometryApi,
  StlGeometryApi,
} from '../api';
import { CoreFailure, STL_ERRORS } from '../api';
import {
  CLOUD_VIEWS,
  type BalloonParameters,
  type CloudParameters,
  type CloudView,
  type ExportResult,
  type MeshBuffers,
  type PurgeEstimate,
  type Vec2,
} from '../types';
import { atan2, cos, log, PI, pow, sin } from '../swift/dmath';
import { balloonExportFilename, balloonExportFormat, balloonParameters, normalizeBalloon, normalizePattern, normalizePurge } from './balloon';
import { basketFilename, normalizeBasket } from './basket';
import { cableClip, clipNames, normalizeClip } from './clip';
import {
  cableConfigurations,
  cableSides,
  clampFits,
  cloudParameters,
  lampFilename,
  lampLayout,
  lampProfile,
  lampRadius,
  nailInsert,
  normalizeLamp,
} from './cloud';
import { FIGURE_STYLES } from '../types';
import { figureFilename, figureOutline, figureParameters, figureSetFilename, normalizeFigure } from './figure';
import { append, binarySTL, box, emptyMesh, extrude, lathe, storedZip, toBuffers, torus, transformed, translated, utf8, type StubMesh } from './mesh';
import { normalizeRing, ringFilename, ringParameters } from './ring';
import { swiftMax, swiftMin } from './swiftCompat';

const single = (filename: string, mime: ExportResult['mime'], bytes: Uint8Array): ExportResult => ({
  filename,
  mime,
  files: [{ name: filename, bytes }],
});

const STUB_NOTE = 'Placeholder geometry from the stub core (VITE_CORE=stub). Not for printing.';

// --- Balloon ---------------------------------------------------------------------

/** Neck cylinder, then a bulb whose widest point sits at the shoulder height. */
const balloonBody = (p: BalloonParameters, segments: number): StubMesh => {
  const neck = p.neckDiameter / 2, rows = 40;
  const shoulder = swiftMin(swiftMax(p.shoulder / 100, 0.05), 0.95);
  const k = log(0.5) / log(shoulder);
  const outline = (inset: number): [number, number][] => {
    const profile: [number, number][] = [[0, inset], [neck - inset, inset], [neck - inset, p.neckHeight]];
    for (let i = 1; i < rows; i += 1) {
      const u = i / rows, z = p.neckHeight + (p.height - p.neckHeight - inset) * u;
      const bulb = (p.diameter / 2) * sin(PI * pow(u, k));
      profile.push([swiftMax(swiftMax(bulb, neck * (1 - u)) - inset, 0.5), z]);
    }
    profile.push([0, p.height - inset]);
    return profile;
  };
  const body = lathe(outline(0), segments);
  if (p.hollow) append(body, lathe(outline(p.wallThickness), segments, true));
  if (p.hangingLoop) {
    const loop = balloonParameters.derived(p).loopHeight, half = p.hangingThickness / 2;
    append(body, box(-half, half, -p.hangingWall, p.hangingWall, p.height - 2, p.height + loop));
  }
  return body;
};

const paint = (m: StubMesh, p: BalloonParameters, pattern: ReturnType<typeof normalizePattern>): void => {
  const look = balloonParameters.pattern.derived(pattern, p);
  if (!look.multicolor) return;
  for (let t = 0; t < m.colors.length; t += 1) {
    const [a, b, c] = [m.indices[3 * t]!, m.indices[3 * t + 1]!, m.indices[3 * t + 2]!];
    const z = (m.positions[3 * a + 2]! + m.positions[3 * b + 2]! + m.positions[3 * c + 2]!) / 3;
    const x = (m.positions[3 * a]! + m.positions[3 * b]! + m.positions[3 * c]!) / 3;
    const y = (m.positions[3 * a + 1]! + m.positions[3 * b + 1]! + m.positions[3 * c + 1]!) / 3;
    if (look.hasRelief) m.colors[t] = z >= look.capBoundary ? 1 : 0;
    else if (pattern.style === 'Horizontal stripes') m.colors[t] = Math.floor((z / p.height) * pattern.bands) % 2;
    else {
      const sector = Math.floor(((atan2(y, x) + PI) / (2 * PI)) * pattern.repeats * 2);
      m.colors[t] = z > p.neckHeight && z < p.height * 0.9 && sector % 2 === 0 ? 1 : 0;
    }
  }
};

/** STUB: a rough count of colour changes so the summary has numbers to show. */
const stubEstimate = (multicolor: boolean, bands: number, layers: number): PurgeEstimate =>
  multicolor
    ? { mixedLayers: layers, minimumChanges: bands, maximumChanges: 2 * bands, minimumGrams: bands * 0.5, maximumGrams: bands }
    : { mixedLayers: 0, minimumChanges: 0, maximumChanges: 0, minimumGrams: 0, maximumGrams: 0 };

const balloon: BalloonGeometryApi = {
  preview(snapshot) {
    const parameters = normalizeBalloon(snapshot.parameters);
    const pattern = normalizePattern(snapshot.pattern, parameters);
    const purge = normalizePurge(snapshot.purge);
    const m = balloonBody(parameters, parameters.panels * 3);
    paint(m, parameters, pattern);
    const multicolor = balloonParameters.pattern.derived(pattern, parameters).multicolor;
    const layers = Math.ceil(parameters.height / purge.layerHeight);
    return { parameters, pattern, purge, mesh: toBuffers(m), estimate: stubEstimate(multicolor, pattern.bands, layers) };
  },
  export(snapshot) {
    const parameters = normalizeBalloon(snapshot.parameters);
    const pattern = normalizePattern(snapshot.pattern, parameters);
    const filename = balloonExportFilename({ parameters, pattern, purge: snapshot.purge });
    const m = balloonBody(parameters, parameters.panels * 6);
    if (balloonExportFormat(pattern) === 'stl') return single(filename, 'model/stl', binarySTL(m));
    paint(m, parameters, pattern);
    return single(filename, 'model/3mf', stubThreeMF(m, balloonParameters.pattern.codec.encode(pattern)));
  },
};

/** A minimal 3MF package: one object with per-triangle paint colors. */
const stubThreeMF = (m: StubMesh, patternJSON: string): Uint8Array => {
  const vertices: string[] = [];
  for (let i = 0; i < m.positions.length; i += 3) vertices.push(`<vertex x="${m.positions[i]}" y="${m.positions[i + 1]}" z="${m.positions[i + 2]}"/>`);
  const triangles: string[] = [];
  for (let t = 0; t < m.colors.length; t += 1) {
    const paint = m.colors[t] === 1 ? ' paint_color="8"' : ' paint_color="4"';
    triangles.push(`<triangle v1="${m.indices[3 * t]}" v2="${m.indices[3 * t + 1]}" v3="${m.indices[3 * t + 2]}"${paint}/>`);
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Balloon Studio (stub core)</metadata><resources><object id="1" type="model"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>\n`;
  return storedZip([
    { name: '[Content_Types].xml', bytes: utf8('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n') },
    { name: '_rels/.rels', bytes: utf8('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n') },
    { name: '3D/3dmodel.model', bytes: utf8(model) },
    { name: 'Metadata/pattern-settings.json', bytes: utf8(patternJSON) },
  ]);
};

// --- Basket ----------------------------------------------------------------------

const basketMesh = (input: Parameters<BasketGeometryApi['preview']>[0]): StubMesh => {
  const p = normalizeBasket(input);
  const depth = p.style === 'ribbed' ? p.width : p.depth;
  return box(-p.width / 2, p.width / 2, -depth / 2, depth / 2, 0, p.height);
};

const basket: BasketGeometryApi = {
  preview: (input) => ({ parameters: normalizeBasket(input), mesh: toBuffers(basketMesh(input), false) }),
  export: (input) => single(basketFilename(normalizeBasket(input)), 'model/stl', binarySTL(basketMesh(input))),
};

// --- Ring ------------------------------------------------------------------------

const ringMesh = (p: ReturnType<typeof normalizeRing>, lift = 0): StubMesh => {
  const m = torus(p.diameter / 2 - p.bandWidth / 2, p.bandWidth / 2, p.height / 2, p.height / 2 + lift);
  // The LED faces, colored like `ledFaces`: the upper half of the tube.
  for (let t = 0; t < m.colors.length; t += 1) m.colors[t] = m.positions[3 * m.indices[3 * t]! + 2]! > p.height / 2 + lift ? 1 : 0;
  return m;
};
const RING_PART_NAMES = ['A-cord-guide-print-3.stl', 'B-plain-section-print-3.stl', 'C-underside-plate-print-6.stl', 'D-alignment-pin-print-12.stl'];
const ringParts = (p: ReturnType<typeof normalizeRing>): StubMesh[] => {
  const arc = p.bandWidth;
  return [
    box(-arc, arc, -arc / 2, arc / 2, 0, p.height),
    box(-arc, arc, -arc / 2, arc / 2, 0, p.height * 0.8),
    box(-arc / 2, arc / 2, -arc / 4, arc / 4, 0, 2),
    box(-2, 2, -2, 2, 0, p.height),
  ];
};

const ring: RingGeometryApi = {
  preview(input) {
    const p = normalizeRing(input);
    const assembled = toBuffers(ringMesh(p));
    if (!p.segmented) return { parameters: p, assembled, exploded: toBuffers(ringMesh(p)), parts: [] };
    return { parameters: p, assembled, exploded: toBuffers(ringMesh(p, 12)), parts: ringParts(p).map((m) => toBuffers(m)) };
  },
  export(input) {
    const p = normalizeRing(input);
    const filename = ringFilename(p);
    if (!p.segmented) return single(filename, 'model/stl', binarySTL(ringMesh(p)));
    const entries = ringParts(p).map((m, i) => ({ name: RING_PART_NAMES[i]!, bytes: binarySTL(m) }));
    entries.push({ name: 'kit-manifest.json', bytes: utf8(JSON.stringify({ stub: STUB_NOTE, parameters: JSON.parse(ringParameters.codec.encode(p)) })) });
    entries.push({ name: 'ASSEMBLY.md', bytes: utf8(`# Mobile ring kit\n\n${STUB_NOTE}\n`) });
    return single(filename, 'application/zip', storedZip(entries));
  },
};

// --- Cloud and sun ----------------------------------------------------------------

const lampOutline = (p: CloudParameters, samples: number, inset = 0): Vec2[] => {
  const l = lampLayout(p), profile = lampProfile(p.kind === 'sun' ? { kind: 'sun', sunStyle: p.sunStyle } : { kind: 'cloud', style: p.style, mirrored: p.mirrored });
  return Array.from({ length: samples }, (_, i) => {
    const a = (i * 2 * PI) / samples, r = lampRadius(a, inset, p.width, l.verticalScale, profile);
    return { x: r * cos(a), y: r * sin(a) };
  });
};

const lampKit = (input: CloudParameters) => {
  const p = normalizeLamp(input);
  const samples = p.kind === 'sun' ? 240 : 80;
  const outline = lampOutline(p, samples);
  const back = extrude(outline, 0, p.depth);
  const front = extrude(outline, 0, p.diffuserThickness + (p.surface === 'sculpted' ? p.surfaceDepth : 0));
  const configurations = cableConfigurations(p);
  const seals = configurations.map((_, i) => box(-4 + i * 10, 4 + i * 10, -3, 3, 0, 6));
  const withClamp = configurations.map((q) => clampFits(q));
  const insert = p.nailInsert ? nailInsert(p) : null;
  return { p, outline, back, front, seals, withClamp, insert };
};

const lampPreview: CloudGeometryApi['preview'] = (input) => {
  const { p, back, front, seals, withClamp, insert } = lampKit(input);
  const clampCount = withClamp.filter(Boolean).length;
  const sides = cableSides(p);
  const assembly = (lift: number) => {
    const m = append(emptyMesh(), back, 0);
    append(m, translated(front, 0, 0, p.depth + lift), 1);
    seals.forEach((seal) => append(m, translated(seal, swiftMin(p.width / 2 - 10, 60), 0, lift / 2), 2));
    return m;
  };
  const sealPrint = seals.reduce((m, seal) => append(m, seal), emptyMesh());
  const clampPrint = clampCount > 0 ? append(emptyMesh(), box(-8, 8, -4, 4, 0, 4), 3) : sealPrint;
  const insertMesh = insert ? append(emptyMesh(), box(-insert.halfWidth, insert.halfWidth, 0, insert.height, 0, 2.7), 3) : null;
  const rear = append(emptyMesh(), back, 0);
  const views: Record<CloudView, MeshBuffers> = {
    assembled: toBuffers(assembly(0)),
    exploded: toBuffers(assembly(20)),
    back: toBuffers(append(emptyMesh(), back, 0)),
    rear: toBuffers(rear),
    front: toBuffers(front, false),
    seal: toBuffers(sealPrint, false),
    clamp: toBuffers(clampPrint, false),
    insert: insertMesh ? toBuffers(insertMesh, false) : toBuffers(rear),
  };
  const sections = [-1, 0, 1].map((row) => ({ x: 0, y: row * p.ledRowSpacing, length: swiftMax(p.width * 0.4 - Math.abs(row) * 20, 10) }));
  const totalLength = sections.reduce((sum, s) => sum + s.length, 0);
  return {
    parameters: p,
    views: Object.fromEntries(CLOUD_VIEWS.map((view) => [view, views[view]])) as Record<CloudView, MeshBuffers>,
    ledPlan: { sections, totalLength, nominalWatts: totalLength * 0.009, rowCount: sections.length },
    nailInsert: insert,
    hasInsertMesh: insert !== null,
    clampCount,
    cableCount: sides.length,
    cablesWithoutClamp: sides.filter((_, i) => !withClamp[i]),
    printedParts: 2 + sides.length + 2 * clampCount + (insert ? 1 : 0),
    instructions: `# ${cloudParameters.derived(p).displayName} lamp\n\n${STUB_NOTE}\n`,
  };
};

const lampExport: CloudGeometryApi['export'] = (input) => {
  const { p, back, front, seals, withClamp, insert } = lampKit(input);
  const constants = cloudParameters.constants;
  const labeled = seals.length > 1;
  const sides = cableSides(p);
  const name = (original: string, i: number) => (labeled ? `${original.slice(0, -4)}-${sides[i]}.stl` : original);
  const entries = [
    { name: `A-${p.kind}-back-opaque.stl`, bytes: binarySTL(back) },
    { name: cloudParameters.derived(p).frontFilename, bytes: binarySTL(front) },
  ];
  seals.forEach((seal, i) => {
    entries.push({ name: name(constants.sealFilename, i), bytes: binarySTL(seal) });
    if (withClamp[i]) {
      entries.push({ name: name(constants.barFilename, i), bytes: binarySTL(box(-8, 8, -2, 2, 0, 3)) });
      entries.push({ name: name(constants.anvilFilename, i), bytes: binarySTL(box(-6, 6, -3, 3, 0, 4)) });
    }
  });
  if (insert) entries.push({ name: constants.insertFilename, bytes: binarySTL(box(-insert.halfWidth, insert.halfWidth, 0, insert.height, 0, 2.7)) });
  entries.push(
    { name: 'LED-LAYOUT.svg', bytes: utf8(`<svg xmlns="http://www.w3.org/2000/svg"><!-- ${STUB_NOTE} --></svg>\n`) },
    { name: 'ASSEMBLY.md', bytes: utf8(`# Assembly\n\n${STUB_NOTE}\n`) },
    { name: `${p.kind}-settings.json`, bytes: utf8(cloudParameters.codec.encode(p)) },
  );
  return single(lampFilename(p), 'application/zip', storedZip(entries));
};

const cloud: CloudGeometryApi = { preview: lampPreview, export: lampExport };

// --- Figures -----------------------------------------------------------------------

const figureMesh = (input: Parameters<FigureGeometryApi['preview']>[0]) => {
  const p = normalizeFigure(input);
  const outline = figureOutline(p.style);
  const scale = p.height / outline.rawHeight;
  const cx = (outline.minX + outline.maxX) / 2, cy = (outline.minY + outline.maxY) / 2;
  const loop = outline.loops[0]!.map((q) => ({ x: (q.x - cx) * scale, y: (q.y - cy) * scale }));
  const thickness = p.edge + (p.surface !== 'flat' ? p.dome * (p.doubleSided ? 2 : 1) : 0);
  const print = extrude(loop, 0, thickness);
  const hole = { x: (outline.centroid.x - cx) * scale, y: p.height / 2 - p.holeMargin - p.holeDiameter / 2 };
  return { p, print, hole, scale, width: outline.rawWidth * scale };
};

const figure: FigureGeometryApi = {
  preview(input) {
    const { p, print, hole, width } = figureMesh(input);
    // Upright, the thread (color 1) rising from the hole.
    const hanging = transformed(print, (x, y, z) => [x, z, y]);
    append(hanging, box(hole.x - 0.2, hole.x + 0.2, -0.2, 0.2, hole.y, hole.y + p.height * 0.55), 1);
    const chainHole = p.chainHole ? { x: hole.x, y: -p.height / 2 + p.holeMargin + p.holeDiameter / 2 } : null;
    return {
      parameters: p,
      printMesh: toBuffers(print, false),
      hangingMesh: toBuffers(hanging),
      width,
      hangingHole: hole,
      chainHole,
      holesWanted: 1 + (p.chainHole ? 1 : 0),
      holes: 1 + (chainHole ? 1 : 0),
    };
  },
  export(input, variant) {
    const p = normalizeFigure(input);
    if (variant === 'single') return single(figureFilename(p), 'model/stl', binarySTL(figureMesh(p).print));
    const entries = FIGURE_STYLES.map((style) => {
      const q = { ...p, style };
      return { name: figureFilename(q), bytes: binarySTL(figureMesh(q).print) };
    });
    entries.push({ name: 'FIGURES.md', bytes: utf8(`# Mobile figures\n\n${STUB_NOTE}\n`) });
    entries.push({ name: 'figure-settings.json', bytes: utf8(figureParameters.codec.encode(p)) });
    return single(figureSetFilename(p), 'application/zip', storedZip(entries));
  },
};

// --- Cable clip --------------------------------------------------------------------

const clipMesh = (input: Parameters<ClipGeometryApi['preview']>[0]) => {
  const p = normalizeClip(input);
  const c = cableClip(p);
  const body = box(-c.halfWidth, c.halfWidth, -p.length / 2, c.plateEnd, 0, c.height);
  return { p, c, body };
};

const clip: ClipGeometryApi = {
  preview(input) {
    const { p, c, body } = clipMesh(input);
    const print = p.flat ? body : transformed(body, (x, y, z) => [x, -z, y]);
    const assembly = append(emptyMesh(), body, 0);
    append(assembly, box(-c.radius, c.radius, -c.length * 0.65, c.length * 0.65, c.center - c.radius, c.center + c.radius), 2);
    if (c.nailY !== null) append(assembly, box(-0.5, 0.5, c.nailY - 0.5, c.nailY + 0.5, -8, c.plateThickness), 3);
    return { parameters: p, printMesh: toBuffers(print, false), assemblyMesh: toBuffers(assembly), clip: c };
  },
  export(input) {
    const { p, c, body } = clipMesh(input);
    if (c.problem !== null) throw new CoreFailure('export-blocked', c.problem);
    return single(clipNames(p).filename, 'model/stl', binarySTL(p.flat ? body : transformed(body, (x, y, z) => [x, -z, y])));
  },
};

// --- STL import ----------------------------------------------------------------------

const stl: StlGeometryApi = {
  open(bytes) {
    if (bytes.length > 150_000_000) throw new CoreFailure('invalid-stl', STL_ERRORS.tooLarge);
    if (bytes.length === 0) throw new CoreFailure('invalid-stl', STL_ERRORS.emptyOrTooLarge);
    if (bytes.length < 84) throw new CoreFailure('invalid-stl', STL_ERRORS.incomplete);
    // STUB: the file is not parsed; it opens as the classic balloon.
    const parameters = normalizeBalloon(balloonParameters.defaults);
    const body = balloonBody(parameters, parameters.panels * 3);
    return { mesh: toBuffers(body, false), parameters, restoredSettings: false, notes: STUB_NOTE, editable: toBuffers(body, false) };
  },
};

export const geometry = { balloon, basket, ring, cloud, figure, clip, stl };
