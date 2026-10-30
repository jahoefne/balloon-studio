// Ported from mac/Sources/BalloonStudio/ThreeMF.swift @ 04553ee (lines 3-54: PaintedBalloon.threeMF).
// StoredZIP (:57-85) is core/io/storedZip.ts.
import { MeshError } from '../geometry/mesh';
import { storedZipArchive } from '../io/storedZip';
import { swiftDescription } from '../swift/format';
import { encodeJSONCompactSerialization } from '../swift/json';
import { utf8 } from '../swift/text';
import { FILAMENT_COLOR_HEX } from '../types';
import type { PatternSettings, PurgeSettings } from '../types';
import { baseColor, calculatePurgeEstimate, detailColor, normalizedPurge, patternToJSON, type PaintedBalloon } from './balloonPatterns';

/** Appends text as UTF-8. A relief model reaches 200 MB, too much for one concatenated string. */
class TextSink {
  private bytes = new Uint8Array(1 << 20);
  private length = 0;
  private pending = '';
  private readonly encoder = new TextEncoder();

  append(text: string): void {
    this.pending += text;
    if (this.pending.length > 1 << 16) this.flush();
  }

  private flush(): void {
    const needed = this.length + this.pending.length * 3;
    if (needed > this.bytes.length) {
      let capacity = this.bytes.length;
      while (capacity < needed) capacity *= 2;
      const grown = new Uint8Array(capacity);
      grown.set(this.bytes.subarray(0, this.length));
      this.bytes = grown;
    }
    this.length += this.encoder.encodeInto(this.pending, this.bytes.subarray(this.length)).written;
    this.pending = '';
  }

  finish(): Uint8Array {
    this.flush();
    return this.bytes.slice(0, this.length);
  }
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="json" ContentType="application/json"/><Default Extension="txt" ContentType="text/plain"/></Types>';
const RELATIONSHIPS =
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';

/** Swift `PaintedBalloon.threeMF(settings:purge:)`. */
export function threeMF(painted: PaintedBalloon, settings: PatternSettings, purge: PurgeSettings): Uint8Array {
  const { mesh, colors } = painted;
  mesh.validate();
  if (colors.length !== mesh.triangles.length || !colors.every((c) => c === 0 || c === 1)) throw new MeshError('invalid filament assignments');
  const baseHex = FILAMENT_COLOR_HEX[baseColor(settings)];
  const detailHex = FILAMENT_COLOR_HEX[detailColor(settings)];
  const xml = new TextSink();
  xml.append(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02" requiredextensions="m">',
      '<metadata name="Application">Balloon Studio 1.4</metadata>',
      '<metadata name="Title">Patterned balloon</metadata>',
      `<resources><m:colorgroup id="2"><m:color color="${baseHex}"/><m:color color="${detailHex}"/></m:colorgroup>`,
      '<object id="1" type="model" name="Balloon" pid="2" pindex="0"><mesh><vertices>',
    ].join('\n'),
  );
  for (const v of mesh.vertices) xml.append(`<vertex x="${swiftDescription(v.x)}" y="${swiftDescription(v.y)}" z="${swiftDescription(v.z)}"/>\n`);
  xml.append('</vertices><triangles>\n');
  mesh.triangles.forEach((t, i) => {
    const c = colors[i] as number;
    // Bambu's unsplit facet state is the 1-based filament index shifted left two bits.
    xml.append(`<triangle v1="${t.a}" v2="${t.b}" v3="${t.c}" pid="2" p1="${c}" p2="${c}" p3="${c}" paint_color="${c === 0 ? '4' : '8'}"/>\n`);
  });
  xml.append('</triangles></mesh></object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 128 128 0"/></build></model>');
  const density = swiftDescription(normalizedPurge(purge).density);
  const config = {
    filament_colour: [baseHex, detailHex],
    filament_type: ['PLA', 'PLA'],
    filament_diameter: ['1.75', '1.75'],
    filament_density: [density, density],
  };
  // Estimator inputs are descriptive metadata only, never silently applied as printer settings.
  const estimate = calculatePurgeEstimate(painted, purge);
  const note = [
    'Balloon Studio: two-color surface-painted model, millimetres, neck down.',
    'Import in Bambu Studio, use the color-mapping dialog to add or map both colors, choose your P2S printer/process,',
    'and inspect sliced colors and flushing volumes. This file contains no printer G-code.',
    `Pattern: ${settings.style}. Estimated changes: ${estimate.minimumChanges}–${estimate.maximumChanges}.`,
    `Estimated change-related chute waste: ${swiftDescription(estimate.minimumGrams)}–${swiftDescription(estimate.maximumGrams)} g.`,
    `Assumed layer height: ${swiftDescription(purge.layerHeight)} mm; base to pattern: ${swiftDescription(purge.baseToDetail)} mm³;`,
    `pattern to base: ${swiftDescription(purge.detailToBase)} mm³; multiplier: ${swiftDescription(purge.multiplier)}; density: ${swiftDescription(purge.density)} g/cm³.`,
    'Excludes startup purge, prime tower, supports, and flushing into the model. Confirm after slicing.',
  ].join('\n');
  return storedZipArchive([
    ['[Content_Types].xml', utf8(CONTENT_TYPES)],
    ['_rels/.rels', utf8(RELATIONSHIPS)],
    ['3D/3dmodel.model', xml.finish()],
    ['Metadata/balloon-settings.json', utf8(encodeJSONCompactSerialization(config))],
    ['Metadata/pattern-settings.json', utf8(patternToJSON(settings))],
    ['Metadata/balloon-studio.txt', utf8(note)],
  ]);
}
