// Ported from mac/Sources/BalloonStudio/CloudGeometry.swift @ 04553ee: CloudCableParts (:276-316) and
// CloudKit (:321-704). They have a file of their own here (plan §2).

import type { Quality } from '../api';
import { BalloonMesh } from '../geometry/mesh';
import type { Point3, Triangle } from '../geometry/point3';
import { binarySTL } from '../io/binaryStl';
import { storedZipArchive, type ZipEntry } from '../io/storedZip';
import { formatFixed } from '../swift/format';
import { arrayMin } from '../swift/minmax';
import { utf8 } from '../swift/text';
import { CABLE_SIDE_TITLE, LAMP_SURFACE_TITLE, WALL_LAMP_KIND_INFO, type CloudParameters } from '../types';
import { CableClamp, CableClampGenerator } from './cableClamp';
import { CableOutlet, CableSealGenerator, cableSidePlace } from './cableSeal';
import { CloudLEDPlan } from './cloudLedLayout';
import {
  cableConfigurations,
  cableSides,
  CloudConstants,
  CloudGenerator,
  displayName,
  encodeCloudParameters,
  fitsP2S,
  frontFilename,
  height,
  Layout,
  normalized,
  totalDepth,
} from './cloudGeometry';
import { NailInsert, NailInsertGenerator } from './nailInsert';

/** Each outlet gets its own seal, since its ends follow that side's wall. */
export class CloudCableParts {
  readonly parameters: CloudParameters;
  readonly seal: BalloonMesh;
  readonly clamp: CableClamp | null;
  readonly bar: BalloonMesh | null;
  readonly anvil: BalloonMesh | null;
  readonly labeled: boolean;

  constructor(p: CloudParameters, back: BalloonMesh, quality: Quality, labeled: boolean) {
    this.parameters = p;
    this.labeled = labeled;
    this.seal = CableSealGenerator.generate(p, quality);
    const clamp = CableClamp.create(p);
    this.clamp = null;
    if (clamp !== null) {
      const corner = clamp.posts[0]![0]!, postTop = clamp.postTop;
      if (back.vertices.some((v) => Math.abs(v.z - postTop) < 1e-6 && Math.abs(v.x - corner[0]) < 1e-6 && Math.abs(v.y - corner[1]) < 1e-6)) this.clamp = clamp;
    }
    this.bar = this.clamp === null ? null : CableClampGenerator.bar(p);
    this.anvil = this.clamp === null ? null : CableClampGenerator.anvil(p);
  }
  private filename(original: string): string {
    return this.labeled ? `${original.slice(0, -4)}-${this.parameters.cableSide}.stl` : original;
  }
  get sealFilename(): string {
    return this.filename(CloudConstants.sealFilename);
  }
  get barFilename(): string {
    return this.filename(CloudConstants.barFilename);
  }
  get anvilFilename(): string {
    return this.filename(CloudConstants.anvilFilename);
  }
  placedSeal(exploded = false): BalloonMesh {
    return CableSealGenerator.placed(this.seal, this.parameters, exploded ? 14 : 0);
  }
  placedClamp(exploded = false): BalloonMesh[] {
    if (this.bar === null || this.anvil === null) return [];
    return [
      CableClampGenerator.placedAnvil(this.anvil, this.parameters, exploded ? 6 : 0),
      CableClampGenerator.placedBar(this.bar, this.parameters, exploded ? 18 : 0),
      CableClampGenerator.placedScrews(this.parameters, exploded ? 28 : 0),
    ];
  }
  get clampPrintView(): BalloonMesh | null {
    if (this.bar === null || this.anvil === null) return null;
    return CableClampGenerator.printView(this.bar, this.anvil);
  }
}

/** `var mesh = base`, a value copy that the appends below leave `base` out of. */
const copied = (base: BalloonMesh): BalloonMesh => new BalloonMesh([...base.vertices], [...base.triangles], base.maxOverhang);

/** `mesh.vertices += part.vertices; mesh.triangles += part.triangles.map { … + offset }` */
const append = (mesh: BalloonMesh, part: BalloonMesh): void => {
  const offset = mesh.vertices.length;
  for (const v of part.vertices) mesh.vertices.push(v);
  for (const t of part.triangles) mesh.triangles.push({ a: t.a + offset, b: t.b + offset, c: t.c + offset });
};

const repeating = (value: number, count: number): number[] => new Array<number>(count).fill(value);

const printView = (parts: readonly BalloonMesh[]): BalloonMesh => {
  if (parts.length <= 1) return parts[0]!;
  const mesh = new BalloonMesh([], [], 0);
  const widths = parts.map((part) => part.dimensions.x), gap = 5.0;
  let x = -(widths.reduce((sum, width) => sum + width, 0) + gap * (parts.length - 1)) / 2;
  parts.forEach((part, index) => {
    const offset = mesh.vertices.length, origin = arrayMin(part.vertices.map((v) => v.x))!;
    for (const v of part.vertices) mesh.vertices.push({ x: v.x - origin + x, y: v.y, z: v.z });
    for (const t of part.triangles) mesh.triangles.push({ a: t.a + offset, b: t.b + offset, c: t.c + offset });
    x += widths[index]! + gap;
  });
  return mesh;
};

const mm = (v: number): string => formatFixed(v, 1);

/**
 * Connected solids, each exported in its print orientation: back, front
 * and seal, the clamp's bar and anvil where the lamp has a strain relief,
 * and the slot insert where it is wanted. Assembly is preview only.
 */
export class CloudKit {
  readonly parameters: CloudParameters;
  readonly back: BalloonMesh;
  readonly front: BalloonMesh;
  readonly cables: readonly CloudCableParts[];
  readonly ledPlan: CloudLEDPlan;
  /** Null unless it is wanted and the pocket and the nail suit it. */
  readonly nailInsert: NailInsert | null;
  readonly insertMesh: BalloonMesh | null;

  constructor(input: CloudParameters, quality: Quality = 'preview') {
    const p = normalized(input);
    this.parameters = p;
    this.ledPlan = new CloudLEDPlan(p);
    this.back = CloudGenerator.generate(p, false, quality);
    this.front = CloudGenerator.generate(p, true, quality);
    const mesh = this.back;
    this.cables = cableConfigurations(p).map((q) => new CloudCableParts(q, mesh, quality, cableSides(p).length > 1));
    this.nailInsert = p.nailInsert ? NailInsert.create(p) : null;
    this.insertMesh = this.nailInsert === null ? null : NailInsertGenerator.generate(this.nailInsert);
  }
  get seal(): BalloonMesh {
    return this.cables[0]!.seal;
  }
  get clamp(): CableClamp | null {
    return this.cables[0]!.clamp;
  }
  get bar(): BalloonMesh | null {
    return this.cables[0]!.bar;
  }
  get anvil(): BalloonMesh | null {
    return this.cables[0]!.anvil;
  }
  get clampCount(): number {
    return this.cables.filter((cable) => cable.clamp !== null).length;
  }
  /** In its pocket, or waiting behind the wall side. */
  placedInsert(exploded = false): BalloonMesh[] {
    if (this.nailInsert === null || this.insertMesh === null) return [];
    return [this.nailInsert.placed(this.insertMesh, exploded)];
  }
  /** The back turned over to the wall side, with the insert in its pocket. */
  get rear(): BalloonMesh {
    const mesh = copied(this.back);
    for (const part of this.placedInsert()) append(mesh, part);
    mesh.vertices = mesh.vertices.map((v) => ({ x: v.x, y: -v.y, z: this.parameters.depth - v.z }));
    return mesh;
  }
  get rearColors(): number[] {
    return this.insertMesh === null ? [] : [...repeating(0, this.back.triangles.length), ...repeating(3, this.insertMesh.triangles.length)];
  }
  /** Exploded, the seal waits in front of its pocket. */
  placedSeal(exploded = false): BalloonMesh {
    return this.cables[0]!.placedSeal(exploded);
  }
  /** Anvil, bar and screws. Exploded, they wait above the posts, in the order they go in. The screws are shown only. */
  placedClamp(exploded = false): BalloonMesh[] {
    return this.cables.flatMap((cable) => cable.placedClamp(exploded));
  }
  get clampPrintView(): BalloonMesh | null {
    const parts = this.cables.map((cable) => cable.clampPrintView).filter((part) => part !== null);
    return parts.length === 0 ? null : printView(parts);
  }
  get sealPrintView(): BalloonMesh {
    return printView(this.cables.map((cable) => cable.seal));
  }

  placedFront(exploded = false): BalloonMesh {
    // Rotate about X, not mirror, to retain outward triangle winding.
    const p = this.parameters;
    const vertices: Point3[] =
      p.surface === 'sculpted'
        ? this.front.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z + p.depth - CloudConstants.skirt + (exploded ? 32 : 0) }))
        : this.front.vertices.map((v) => ({ x: v.x, y: -v.y, z: totalDepth(p) - v.z + (exploded ? 32 : 0) }));
    return new BalloonMesh(vertices, this.front.triangles, this.front.maxOverhang);
  }
  assembly(exploded = false): BalloonMesh {
    const mesh = copied(this.back);
    for (const part of [
      this.placedFront(exploded),
      ...this.cables.map((cable) => cable.placedSeal(exploded)),
      ...this.placedClamp(exploded),
      ...this.placedInsert(exploded),
    ]) {
      append(mesh, part);
    }
    return mesh;
  }
  get assemblyColors(): number[] {
    return [
      ...repeating(0, this.back.triangles.length),
      ...repeating(1, this.front.triangles.length),
      ...repeating(2, this.cables.reduce((sum, cable) => sum + cable.seal.triangles.length, 0)),
      ...this.clampColors,
      ...repeating(3, this.insertMesh?.triangles.length ?? 0),
    ];
  }
  /** Bar and anvil in the clamp's color, the screws in the back's. */
  private get clampColors(): number[] {
    return this.cables.flatMap((cable) => cable.placedClamp().flatMap((part, offset) => repeating(offset === 2 ? 0 : 3, part.triangles.length)));
  }
  // Colored placement guides are preview only. The STL has a continuous flat floor.
  get backWithLEDGuides(): BalloonMesh {
    const mesh = copied(this.back);
    for (const s of this.ledPlan.sections) {
      const r = s.footprint(this.parameters.stripWidth), i = mesh.vertices.length;
      mesh.vertices.push({ x: r.x0, y: r.y0, z: 3.02 }, { x: r.x1, y: r.y0, z: 3.02 }, { x: r.x1, y: r.y1, z: 3.02 }, { x: r.x0, y: r.y1, z: 3.02 });
      const faces: Triangle[] = [{ a: i, b: i + 1, c: i + 2 }, { a: i, b: i + 2, c: i + 3 }];
      mesh.triangles.push(...faces);
    }
    for (const seated of [...this.cables.map((cable) => cable.placedSeal()), ...this.placedClamp()]) append(mesh, seated);
    return mesh;
  }
  get backColors(): number[] {
    return [
      ...repeating(0, this.back.triangles.length),
      ...repeating(1, this.ledPlan.sections.length * 2),
      ...repeating(2, this.cables.reduce((sum, cable) => sum + cable.seal.triangles.length, 0)),
      ...this.clampColors,
    ];
  }
  get printedParts(): number {
    return 2 + this.cables.length + 2 * this.clampCount + (this.insertMesh === null ? 0 : 1);
  }
  entries(): ZipEntry[] {
    const p = this.parameters;
    const parts: ZipEntry[] = [
      [`A-${p.kind}-back-opaque.stl`, binarySTL(this.back)],
      [frontFilename(p), binarySTL(this.front)],
    ];
    for (const cable of this.cables) {
      parts.push([cable.sealFilename, binarySTL(cable.seal)]);
      if (cable.bar !== null && cable.anvil !== null) {
        parts.push([cable.barFilename, binarySTL(cable.bar)], [cable.anvilFilename, binarySTL(cable.anvil)]);
      }
    }
    if (this.insertMesh !== null) parts.push([CloudConstants.insertFilename, binarySTL(this.insertMesh)]);
    parts.push(['LED-LAYOUT.svg', utf8(this.ledPlan.svg)], ['ASSEMBLY.md', utf8(this.instructions)], [`${p.kind}-settings.json`, utf8(encodeCloudParameters(p))]);
    return parts;
  }
  archive(): Uint8Array {
    return storedZipArchive(this.entries());
  }

  get instructions(): string {
    return this.instructionsFor(this.cables[0]!, true);
  }

  // The texts below keep Swift's line breaks: no line of theirs may be reflowed or indented.
  private instructionsFor(cable: CloudCableParts, includeGeneral: boolean): string {
    const p = cable.parameters, outlet = new CableOutlet(p), clamp = cable.clamp;
    const clampCount = this.clampCount;
    let relief: string, printing: string;
    if (clampCount > 0) {
      printing = `
D, E: The filament of the back, or PETG where the lamp runs warm. Print
both as supplied, without supports: the bar on its side, with its
screw holes lying and the ribs rising at 45°, the anvil flat with its
ribs up. Print them solid, with 0.2 mm layers or finer. Keep supports
out of the holes of the two posts in the back as well.`;
    } else {
      printing = '';
    }
    if (clamp !== null) {
      relief = `## ${cable.labeled ? `${CABLE_SIDE_TITLE[p.cableSide]} strain relief` : 'Strain relief'}
Behind the seal two posts stand on the floor, ${mm(clamp.channel)} mm apart. The anvil
(${cable.anvilFilename}) and the bar (${cable.barFilename}) clamp the lead between them. You need
two screws M3 × ${mm(CableClamp.screwLength)} mm with a pan head or a button head: machine
screws, or screws for plastic of 3 mm. Heads up to ${mm(CableClamp.headDiameter)} mm wide and
${mm(CableClamp.headHeight)} mm tall fit under the front. The screws form their own thread in
the posts' ${mm(CableClamp.pilot)} mm holes, which are ${mm(clamp.holeDepth)} mm deep: longer screws
reach the bottom before the bar is down.
Fit the clamp once the seal is seated:
1. Lift the lead and drop the anvil between the posts, ribs up. Its
   cross bars lie before and behind the posts. It fits either way round.
2. Lay the lead between the two rails of the anvil.
3. Set the bar across the posts, its tongue on the lead. It fits
   either way round too.
4. Turn the screws in by turns, a little at a time, until the bar
   rests on both posts. Stop there. The posts set how far the lead
   is squeezed: to ${mm(CableClamp.pinch * p.cableDiameter)} mm under the ribs, from ${mm(p.cableDiameter)} mm. More
   torque only strains the thread.
5. Pull the lead from outside. It must not move in the seal.
The ribs are made for a lead of ${mm(p.cableDiameter)} mm. A thinner lead slips, a
thicker one keeps the bar off the posts: measure the lead and set
its diameter in the app. Back, seal, bar and anvil are made for it.
To take the lead out, remove bar and anvil first, then the seal.
The thread is formed in the print and holds for a few assemblies:
take the clamp apart only when needed.`;
    } else if (p.strainRelief) {
      const fromWidth = CableClamp.minimumWidth(p);
      relief = `## ${cable.labeled ? `${CABLE_SIDE_TITLE[p.cableSide]} strain relief` : 'Strain relief'}
This lamp has no room for the screwed strain relief behind its
cable outlet: the nail pocket or the wall stands in its way.
${fromWidth === null ? '' : `From a width of ${mm(fromWidth)} mm it fits. `}Choose another cable exit in the
app, or secure the lead outside the lamp.`;
    } else {
      relief = '';
    }
    const outletGuide = `## ${cable.labeled ? `${CABLE_SIDE_TITLE[p.cableSide]} cable outlet and light seal` : 'Cable outlet and light seal'}
The cable leaves through a ${mm(outlet.window)} mm square window low in the
${p.cableSide === 'top' || p.cableSide === 'bottom' ? 'outer' : 'side'} wall, ${cableSidePlace(p.cableSide)}. Its center is ${mm(outlet.axisZ)} mm
above the rear face, so the back sits flat on the wall without spacers.
The floor has no opening. Inside, two printed cheeks form a pocket for
the flexible seal (${cable.sealFilename}). The seal does the work of the former duct,
baffle and sealant:
- Its ${mm(outlet.bore)} mm bore is ${mm(CableOutlet.grip)} mm smaller than the nominal ${mm(p.cableDiameter)} mm
  cable and closes around the jacket.
- Its ${mm(outlet.nozzle)} mm nozzle fills the window, ${mm(CableOutlet.squeeze)} mm oversize, and ends ${mm(CableOutlet.recess)} mm
  inside the outer surface.
- Its flange covers the wall around the window from the inside.
- The pocket is ${mm(outlet.sealWidth - outlet.pocketWidth)} mm narrower than the seal and presses the slit shut.
Fit it before the LEDs go in:
1. Pass the bare end of the lead through the window from outside and
   pull through as much as the wiring needs, with some slack.
2. Open the seal's slit and press the lead into the bore. The nozzle
   points to the window, the slit to the floor.
3. Pinch the seal and slide it along the floor between the cheeks, until
   the nozzle is in the window and the flange rests against the wall.
   A gentle pull on the lead from outside helps to seat it.${outlet.landing < CableOutlet.landing ? `\n   The nail pocket stands ${mm(outlet.landing)} mm behind the cheeks. Set the seal down\n   right in front of it, tilted if need be, and push it home from there.` : ''}
4. Look at the window from outside: the nozzle fills it all round.
Use a round, flexible lead. The seal cannot close around a flat or
ribbed cable, or around one much thinner than the diameter set in the
app. The seal holds the lead lightly; ${clamp === null ? 'secure the lead outside the lamp\nif it can be pulled' : 'the clamp behind it takes the\npull'}. Do not glue the seal, so the lamp stays serviceable.
The floor in front of the pocket stays free of LEDs to slide the seal in.${p.cableSide !== 'top' ? '' : clamp === null ? '\nWith the outlet at the top, lead the cable up or to the side. The seal\nholds it lightly and is no strain relief: fix the lead to the wall close\nto the lamp, so its weight does not hang on the seal.' : '\nWith the outlet at the top, lead the cable up or to the side. The clamp\ncarries its weight.'}

${relief}`;
    if (!includeGeneral) return outletGuide;
    const nailInsert = this.nailInsert;
    let insertGuide = '';
    if (nailInsert !== null) {
      const insert = nailInsert;
      const slot = 2 * insert.slotHalfWidth, overlap = p.nailHeadDiameter / 2 - insert.slotHalfWidth;
      insertGuide = `
## Slot insert for a small nail head
${CloudConstants.insertFilename} narrows the ${mm(p.nailShaft)} mm shaft slot to ${mm(slot)} mm, for a nail of
${mm(p.nailDiameter)} mm with a ${mm(p.nailHeadDiameter)} mm head. The head then bears on the insert's
${mm(NailInsert.plate)} mm plate, ${mm(overlap)} mm either side of its slot, and the plate on the lip.
Fit it before hanging the lamp:
1. Lay the lamp on its front. Hold the insert flat face up, fingers down,
   the open end of its slot towards the bottom of the lamp.
2. Press it into the square entry until the fingers touch the bottom of
   the pocket. Their chamfered tips squeeze in; pinch them with tweezers
   if it is tight.
3. Push it up behind the lip until it stops at the top of the chamber.
   The fingers spring against the chamber's walls and hold it there.
   Through the lamp's slot you now see the insert's narrow one.
4. Set the nail so that the underside of its head stands ${mm(insert.nearestHead + 0.1)} to ${mm(insert.nearestHead + 0.4)} mm
   off the wall: ${mm(Layout.lip)} mm of lip and ${mm(NailInsert.plate)} mm of plate. Any more lets the
   top of the lamp lean off the wall by as much. Heads up to 1.2 mm
   thick fit behind the plate.
5. Hang the lamp: the head goes in through the square entry, then slide
   the lamp down. The slot's flared mouth leads the shaft in, and a ramp
   on the plate's lower edge leads the head behind it.
To take the insert out, lift the lamp off and slide it back down and out
of the entry with a toothpick.
`;
    }
    const cableGuides = [outletGuide, ...this.cables.slice(1).map((other) => this.instructionsFor(other, false))].join('\n\n');
    const printList = [
      ...this.cables.map((c) => `- ${c.sealFilename}${c.clamp === null ? '' : `\n- ${c.barFilename}\n- ${c.anvilFilename}`}`),
      ...(nailInsert === null ? [] : [`- ${CloudConstants.insertFilename}`]),
    ].join('\n');
    const insertPrinting =
      nailInsert === null
        ? ''
        : `
F: PLA or PETG. Print it as supplied: flat face on the bed, fingers up,
solid, with 0.2 mm layers or finer and without supports. Its fingers are
${mm(NailInsert.finger)} mm wide, so use a 0.4 mm nozzle. Turn on elephant foot compensation,
or trim a flared first layer with a blade: the insert fits its pocket
to tenths of a millimetre.`;
    const ledPlan = this.ledPlan, cableCount = this.cables.length;
    return `# ${WALL_LAMP_KIND_INFO[p.kind].title} wall lamp · ${mm(p.width)} × ${mm(height(p))} × ${mm(totalDepth(p))} mm

Shape: ${displayName(p)}. Keep the parts of this kit together: different
shapes, mirrored outlines and cable exits need their own matching parts.
Surface: ${LAMP_SURFACE_TITLE[p.surface]}${p.surface === 'sculpted' ? ` · ${mm(p.surfaceDepth)} mm raised depth` : ''}.

Print one back, one front and one of each fitting listed below:
${printList}
${cableCount < 2 ? '' : `The ${['two', 'three', 'four'][cableCount - 2]!} outlets are for chaining lamps. Match each seal to its named side; the seals follow different wall contours. ${cableCount === 2 ? 'Both' : 'All'} leads use the selected cable diameter.\n`}All STLs are in millimetres,
at 100% scale, with their lowest point at Z = 0. Do not scale in the
slicer: change the dimensions in Balloon Studio to preserve the cable,
nail and clip fit.
${fitsP2S(p) ? 'All pieces fit the P2S with an 8 mm brim.' : 'This size exceeds the P2S bed with an 8 mm brim. Choose a width of 240 mm or less in the app for a P2S print.'}

## Materials and printing
A: Use opaque filament for the back, or an opaque coating on its outside
and keyhole pocket. A white back can transmit light. A white reflective
lining may be added inside the main light chamber, keeping the seal's
pocket, the cable window and all mating surfaces clear.
B: ${p.kind === 'sun' ? 'White or translucent yellow PLA' : 'White PLA'}, ${mm(p.diffuserThickness)} mm nominal shell thickness.
${p.surface === 'sculpted' ? 'Print curved face up, clips down, in the supplied orientation. The skirt tips are at Z = 0. Use a brim and supports from the build plate under the diffuser, including its outer ledge. Keep support contacts off the spring tabs, catches and relief slots, and remove all supports through the open rear before assembly. Inspect the first layers, unsupported ledges and curved inner roof in your slicer. Fine or adaptive layers keep the gently sloping crowns of the domes smooth. The front is a hollow shell with a solid rolled rim; do not fill the light cavity. This orientation protects the visible curved face from support scars. Prototype the support setup and clip fit before a full-size print.' : 'Print the flat diffuser face down, with the skirt and four clips pointing up.'}
${outlet.notchesSkirt ? "The skirt has a notch at each cable outlet, where it passes over the seal's pocket. Keep supports out of it." : "The skirt passes above the seals' pockets without a notch."}
Print the shell material fully solid to avoid an infill pattern showing
through the face. Begin with 0.2 mm layers and enough walls to fill the
1.6 mm clip beams, their 2.0 mm roots and 2.4 mm back walls. Keep supports out of the cable
window, nail pocket, retention groove and clip slots. Inspect the short
bridges over the window (${mm(outlet.window)} mm) and nail chamber (${mm(p.nailHead)} mm)
in the slicer. They must print cleanly; internal support is hard to remove.
C: Flexible TPU, about 95A, in black or another fully opaque color. White
or translucent TPU glows and must not be used. Print the seal as
supplied: standing on its flat end, nozzle up, without supports. Print
it solid, with 0.2 mm layers or finer, slowly enough for a clean bore
and an open slit. If the ${mm(CableOutlet.slit)} mm slit has fused, open it with a sharp blade.${printing}${insertPrinting}

## LED strip
Attach straight sections to the flat 3 mm floor, with LEDs facing the
diffuser. The colored rectangles
in the app are placement guides, not printed pockets or extra parts.
LED-LAYOUT.svg is a numbered, full-size placement template; print at 100%
and check its 50 mm scale bar. All section lengths are multiples of the
selected ${mm(p.stripCutLength)} mm cut interval. Confirm that interval on
your actual strip and cut ONLY at its marked copper pads; online listings
for Aclorol B0BP7SVX5T have varied. The Amazon.de listing checked on
2026-09-28 specifies 8 mm width, 5 V, 320 LEDs/m, 9 W/m and 16 mm cuts.
Source: https://www.amazon.de/dp/B0BP7SVX5T

${ledPlan.cutList}

Row centers are ${mm(p.ledRowSpacing)} mm apart. Layout reserves 3 mm at
each section end for soldered flexible wire links and keeps strips clear
of the skirt, the nail pocket, every cable seal${clampCount === 0 ? '' : ' and clamp'}. Test the layout loose behind your printed
front before sticking it down. Keep wires low on the floor and away from
clips; bulky solderless connectors may need more space than this plan.
For this single-color 5 V strip, connect all + pads to +5 V and all - pads
to ground (electrically parallel), using insulated flexible wire. Do not
connect a section's + to another section's - as an electrical series chain.
Solder and insulate the links outside the lamp, then attach the sections.

Selected strip thickness including LEDs and tape: ${mm(p.stripThickness)} mm.
Minimum LED-to-front gap: ${mm(p.depth - 3 - p.stripThickness)} mm${p.surface === 'sculpted' ? '; the raised surface adds space above this' : ''}. The row layout is
a starting point, not an optical simulation: ${p.kind === 'sun' ? 'ray tips' : 'lobes'} and the raised fittings
may still show brightness differences. Adjust row spacing and test your
actual PLA; 22 mm back depth provides more mixing room than 16 mm.
A matte white inner finish over an opaque backing helps recycle light;
keep the seal's pocket and the mating surfaces clear.

Total strip: ${mm(ledPlan.totalLength)} mm. At the listing's nominal 9 W/m,
full-power demand is approximately ${mm(ledPlan.nominalWatts)} W / ${mm(ledPlan.nominalWatts / 5)} A at 5 V.
${ledPlan.totalLength > 1000 ? 'This layout needs more than one 1 m strip; the original USB lead/supply must not be assumed sufficient.' : 'Check the USB supply and lead ratings against this demand.'}
These estimates do not validate cooling or wiring. Use dimming to reduce
output and heat, size the supply and wiring for the installed load, and
keep the supply outside. Larger layouts may need separate power feeds and
a suitable heat-spreading mount; PLA is not a heat sink. Check the closed
lamp at the intended brightness until its temperature stabilizes.

${cableGuides}

## Blind nail pocket
On the rear, a square ${mm(p.nailHead)} mm entry opens into a captive head
chamber, with a ${mm(p.nailShaft)} mm shaft slot extending upward by 8 mm.
Settings are clear dimensions: include printing allowance around your
actual nail. The retaining lip is 2.4 mm thick and head space is 3 mm deep.
A solid 3 mm cap isolates the entire pocket from the light chamber.
Fit the head in the entry and slide the lamp down into the narrow slot.
The back rests on the wall. ${nailInsert === null ? 'Set nail projection for the 2.4 mm retaining\nlip and actual head thickness (under 3 mm); verify engagement before use.' : 'With the slot insert, set the nail as described\nbelow and verify engagement before use.'}
The mount supports this lamp only; hang the balloons independently.
${insertGuide}
## Clip the front on
Align the ${p.kind} outlines with the keyhole at the top. Four slotted, 1.6 mm-thick spring tabs engage
the groove inside the back. Each tab thickens inward to a 2.0 mm root,
tapering to the working thickness over 4 mm. Their lead-in ramps deflect the
tabs inward; their shoulders retain the front. The radial running fit is
${mm(p.clipFit)} mm and nominal catch interference is 0.35 mm. The skirt
overlaps the opaque sidewall by 12 mm to hide the seam and clip slots.
Press gently near each tab until seated. Test fit before installing LEDs;
PLA clips can crack if forced. Adjust clip fit in the app and reprint if
needed. For occasional removal, carefully ease the front out one catch
at a time; these are prototype clips, not validated for repeated cycling.

## Check the actual print
Geometry is checked for connected, closed material before export. Physical
clip strength, nail retention, the seal's fit,${clampCount === 0 ? '' : " the clamp's hold,"} opacity, light uniformity
and temperature have not been validated. Illuminate the assembled lamp
in a dark room and check the cable outlet, the side walls and the rear
surface. Light at the outlet means the seal is not seated, the slit is
open or the cable is thinner than set: reseat it or print a seal for the
measured diameter. Correct any pinholes or translucent areas before
wall mounting.`;
  }
}
