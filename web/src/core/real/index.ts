// The real core (VITE_CORE=real, WP-K9): the parameter half from ./parameters, geometry from the
// ported modules. Imported by the core worker via `#core`. This file is wiring and conversion only.
//
// Cancellation follows Swift `Task.isCancelled`: each preview polls before and after it generates,
// as the editors do (BalloonStudioApp.swift:99,106), and the balloon also once per ring of its
// hollow inset (BalloonGeometry.swift:308). Exports and imports run in `Task.detached` without a
// cancellation handler, so nothing there ever sees a cancellation and nothing polls.

import { CoreFailure, type AssetLoader, type BalloonGeometryApi, type BasketGeometryApi, type ClipGeometryApi, type CloudGeometryApi, type CoreApi, type ExportOptions, type FigureGeometryApi, type RingGeometryApi, type RunOptions, type StlGeometryApi } from '../api';
import { drawNightFlight } from '../artwork/nightFlightArtwork';
import { drawSummitCableCar } from '../artwork/summitCableCarArtwork';
import { generate } from '../balloon/balloonGenerator';
import { normalized as normalizedBalloon } from '../balloon/balloonParameters';
import { exportSTL } from '../balloon/balloonStl';
import { open, STLImportError } from '../balloon/stlImport';
import { BasketGenerator, basketFilename, normalizedBasket } from '../basket/basketGeometry';
import { CableClip, CableClipKit, filename as clipFilename, normalized as normalizedClip } from '../clip/cableClip';
import { figureFilename, figureHangingView, figureHoles, figureHolesWanted, figureSetArchive, figureSetFilename, generateFigure, normalizedFigure } from '../figures/figureGeometry';
import { MeshError, type BalloonMesh } from '../geometry/mesh';
import { binarySTL } from '../io/binaryStl';
import { filename as lampFilename, normalized as normalizedLamp } from '../lamp/cloudGeometry';
import { CloudKit } from '../lamp/cloudKit';
import { filename as ringFilename, ledFaces, normalized as normalizedRing, RingGenerator } from '../ring/ringGeometry';
import { SegmentedRingKit } from '../ring/segmentedRing';
import { calculatePurgeEstimate, PaintedBalloon } from '../patterns/balloonPatterns';
import type { PatternRasterizers, TextRasterizer } from '../patterns/raster';
import { threeMF } from '../patterns/threeMF';
import { loadFontSet, type FontSet } from '../text/fontSet';
import { createTextRasterizer, missingGlyphs } from '../text/textMask';
import { CLOUD_VIEWS, type BalloonPreview, type CloudView, type ExportResult, type MeshBuffers, type PatternSettings, type PurgeEstimate } from '../types';
import { emptyMeshBuffers, toMeshBuffers } from './buffers';
import { clipDerived, core as parameters, nailInsertInfo } from './parameters';

/** A failure of the ported modules as the contract's error, with the same Mac string. */
function mapped<T>(body: () => T): T {
  try {
    return body();
  } catch (error) {
    if (error instanceof MeshError) throw new CoreFailure('invalid-mesh', error.message);
    if (error instanceof STLImportError) throw new CoreFailure('invalid-stl', error.message);
    throw error;
  }
}

/** Progress around one call: it never changes the result. */
function run<T>(options: RunOptions | undefined, body: () => T): T {
  options?.onProgress?.(0);
  const result = mapped(body);
  options?.onProgress?.(1);
  return result;
}

const qualityOf = (options: ExportOptions | undefined) => options?.quality ?? 'export';

const single = (filename: string, mime: ExportResult['mime'], bytes: Uint8Array): ExportResult => ({
  filename,
  mime,
  files: [{ name: filename, bytes }],
});

/** A preview between the editors' two polls; `cancelled` is what a discarded run hands back. */
function preview<T>(options: RunOptions | undefined, cancelled: () => T, body: () => T): T {
  return run(options, () => {
    if (options?.isCancelled?.()) return cancelled();
    const result = body();
    return options?.isCancelled?.() ? cancelled() : result;
  });
}

// --- Rasterizers --------------------------------------------------------------------

/** `prepare` fills this; the Text pattern cannot do without it. */
let fonts: FontSet | null = null;
let textRasterizer: TextRasterizer | null = null;

const loadedFonts = (): { fonts: FontSet; textRasterizer: TextRasterizer } => {
  if (fonts === null || textRasterizer === null) throw new CoreFailure('internal', 'The fonts of the Text pattern are not loaded.');
  return { fonts, textRasterizer };
};

const rasterizers: PatternRasterizers = {
  artworks: {
    nightFlight: drawNightFlight,
    summitCableCar: drawSummitCableCar,
  },
  textRasterizer: (text, font) => loadedFonts().textRasterizer(text, font),
};

// --- Balloon -------------------------------------------------------------------------

const NO_ESTIMATE: Readonly<PurgeEstimate> = Object.freeze({ mixedLayers: 0, minimumChanges: 0, maximumChanges: 0, minimumGrams: 0, maximumGrams: 0 });

/** BalloonModel.unpainted (BalloonStudioApp.swift:94): a change of pattern keeps the generated mesh. `make` leaves it alone. */
let unpainted: { key: string; mesh: BalloonMesh } | null = null;

const generatedPreview = (p: BalloonPreview['parameters'], isCancelled: (() => boolean) | undefined): BalloonMesh => {
  const key = parameters.balloon.codec.encode(p);
  if (unpainted?.key === key) return unpainted.mesh;
  const mesh = generate(p, 'preview', isCancelled);
  if (mesh.triangles.length > 0) unpainted = { key, mesh };
  return mesh;
};

/** `missingGlyphs` is about the Text pattern only. A blank or inkless text has no layout, so nothing is missing there either. */
const missingGlyphsOf = (pattern: PatternSettings): string[] =>
  pattern.style === 'Text' ? missingGlyphs(pattern.text, pattern.textFont, loadedFonts().fonts) : [];

const balloon: BalloonGeometryApi = {
  preview(snapshot, options) {
    const p = normalizedBalloon(snapshot.parameters);
    const pattern = parameters.balloon.pattern.normalize(snapshot.pattern, p);
    const purge = parameters.balloon.purge.normalize(snapshot.purge);
    const cancelled = (): BalloonPreview => ({ parameters: p, pattern, purge, mesh: emptyMeshBuffers(), estimate: { ...NO_ESTIMATE }, missingGlyphs: [] });
    return preview(options, cancelled, () => {
      const original = generatedPreview(p, options?.isCancelled);
      // The balloon's own poll came back cancelled; `make` has nothing to paint.
      if (original.triangles.length === 0) return cancelled();
      const painted = PaintedBalloon.make(original, p, pattern, rasterizers);
      return {
        parameters: p,
        pattern,
        purge,
        mesh: toMeshBuffers(painted.mesh, painted.colors),
        estimate: calculatePurgeEstimate(painted, purge),
        missingGlyphs: missingGlyphsOf(pattern),
      };
    });
  },
  export(snapshot, options) {
    const p = normalizedBalloon(snapshot.parameters);
    const pattern = parameters.balloon.pattern.normalize(snapshot.pattern, p);
    const purge = parameters.balloon.purge.normalize(snapshot.purge);
    const filename = parameters.balloon.exportFilename({ parameters: p, pattern, purge });
    return run(options, () => {
      const mesh = generate(p, qualityOf(options));
      if (parameters.balloon.exportFormat(pattern) === 'stl') return single(filename, 'model/stl', exportSTL(mesh, p));
      return single(filename, 'model/3mf', threeMF(PaintedBalloon.make(mesh, p, pattern, rasterizers), pattern, purge));
    });
  },
};

const basket: BasketGeometryApi = {
  preview(input, options) {
    const p = normalizedBasket(input);
    return preview(
      options,
      () => ({ parameters: p, mesh: emptyMeshBuffers() }),
      () => ({ parameters: p, mesh: toMeshBuffers(BasketGenerator.generate(p, 'preview')) }),
    );
  },
  export(input, options) {
    const p = normalizedBasket(input);
    return run(options, () => single(basketFilename(p), 'model/stl', binarySTL(BasketGenerator.generate(p, qualityOf(options)))));
  },
};

const ring: RingGeometryApi = {
  // RingPreviewState (RingEditor.swift:17-38)
  preview(input, options) {
    const p = normalizedRing(input);
    return preview(
      options,
      () => ({ parameters: p, assembled: emptyMeshBuffers(), exploded: emptyMeshBuffers(), parts: [] }),
      () => {
        if (p.segmented) {
          const kit = new SegmentedRingKit(p);
          const assemblyColors = kit.assemblyFaceColors;
          const partColors = kit.partFaceColors;
          return {
            parameters: p,
            assembled: toMeshBuffers(kit.assembly(), assemblyColors),
            exploded: toMeshBuffers(kit.assembly(true), assemblyColors),
            parts: kit.printParts.map((part, i) => toMeshBuffers(part.mesh, partColors[i])),
          };
        }
        const mesh = RingGenerator.generate(p);
        const assembled = toMeshBuffers(mesh, ledFaces(p, mesh));
        return { parameters: p, assembled, exploded: assembled, parts: [] };
      },
    );
  },
  export(input, options) {
    const p = normalizedRing(input);
    const quality = qualityOf(options);
    return run(options, () =>
      p.segmented
        ? single(ringFilename(p), 'application/zip', new SegmentedRingKit(p, quality).archive())
        : single(ringFilename(p), 'model/stl', binarySTL(RingGenerator.generate(p, quality))),
    );
  },
};

const emptyCloudViews = (): Record<CloudView, MeshBuffers> =>
  Object.fromEntries(CLOUD_VIEWS.map((view) => [view, emptyMeshBuffers()])) as Record<CloudView, MeshBuffers>;

/** Swift hands `[]` to the preview where a mesh has no colors, and `rearColors` is `[]` without an insert. */
const colored = (mesh: BalloonMesh, colors: readonly number[]): MeshBuffers => toMeshBuffers(mesh, colors.length === 0 ? undefined : colors);

const cloud: CloudGeometryApi = {
  // CloudEditor.swift:385-402, every view at once. The two fallbacks share the buffers of their mesh.
  preview(input, options) {
    const p = normalizedLamp(input);
    return preview(
      options,
      () => ({ parameters: p, views: emptyCloudViews(), ledPlan: { sections: [], totalLength: 0, nominalWatts: 0, rowCount: 0 }, nailInsert: null, hasInsertMesh: false, clampCount: 0, cableCount: 0, cablesWithoutClamp: [], printedParts: 0, instructions: '' }),
      () => {
        const kit = new CloudKit(p);
        const assemblyColors = kit.assemblyColors;
        const clampPrint = kit.clampPrintView;
        const seal = toMeshBuffers(kit.sealPrintView);
        const rear = colored(kit.rear, kit.rearColors);
        return {
          parameters: p,
          views: {
            assembled: toMeshBuffers(kit.assembly(), assemblyColors),
            exploded: toMeshBuffers(kit.assembly(true), assemblyColors),
            back: toMeshBuffers(kit.backWithLEDGuides, kit.backColors),
            rear,
            front: toMeshBuffers(kit.front),
            seal,
            clamp: clampPrint === null ? seal : toMeshBuffers(clampPrint),
            insert: kit.insertMesh === null ? rear : toMeshBuffers(kit.insertMesh),
          },
          ledPlan: {
            sections: kit.ledPlan.sections.map(({ x, y, length }) => ({ x, y, length })),
            totalLength: kit.ledPlan.totalLength,
            nominalWatts: kit.ledPlan.nominalWatts,
            rowCount: kit.ledPlan.rowCount,
          },
          nailInsert: kit.nailInsert === null ? null : nailInsertInfo(kit.nailInsert),
          hasInsertMesh: kit.insertMesh !== null,
          clampCount: kit.clampCount,
          cableCount: kit.cables.length,
          cablesWithoutClamp: kit.cables.filter((cable) => cable.clamp === null).map((cable) => cable.parameters.cableSide),
          printedParts: kit.printedParts,
          instructions: kit.instructions,
        };
      },
    );
  },
  export(input, options) {
    const p = normalizedLamp(input);
    return run(options, () => single(lampFilename(p), 'application/zip', new CloudKit(p, qualityOf(options)).archive()));
  },
};

const figure: FigureGeometryApi = {
  preview(input, options) {
    const p = normalizedFigure(input);
    return preview(
      options,
      () => ({ parameters: p, printMesh: emptyMeshBuffers(), hangingMesh: emptyMeshBuffers(), width: 0, hangingHole: null, chainHole: null, holesWanted: 0, holes: 0 }),
      () => {
        const body = generateFigure(p);
        const hanging = figureHangingView(body);
        return {
          parameters: p,
          printMesh: toMeshBuffers(body.mesh),
          hangingMesh: toMeshBuffers(hanging.mesh, hanging.colors),
          width: body.width,
          hangingHole: body.hangingHole,
          chainHole: body.chainHole,
          holesWanted: figureHolesWanted(body),
          holes: figureHoles(body),
        };
      },
    );
  },
  export(input, variant, options) {
    const p = normalizedFigure(input);
    return run(options, () =>
      variant === 'set'
        ? single(figureSetFilename(p), 'application/zip', figureSetArchive(p))
        : single(figureFilename(p), 'model/stl', binarySTL(generateFigure(p, qualityOf(options)).mesh)),
    );
  },
};

const clip: ClipGeometryApi = {
  preview(input, options) {
    const p = normalizedClip(input);
    return preview(
      options,
      () => ({ parameters: p, printMesh: emptyMeshBuffers(), assemblyMesh: emptyMeshBuffers(), clip: clipDerived(new CableClip(p)) }),
      () => {
        const kit = CableClipKit.generate(p);
        const assembly = kit.assembly();
        return { parameters: p, printMesh: toMeshBuffers(kit.printView), assemblyMesh: toMeshBuffers(assembly.mesh, assembly.colors), clip: clipDerived(kit.clip) };
      },
    );
  },
  export(input, options) {
    const p = normalizedClip(input);
    // The app disables the export button while there is a problem (CableClipEditor.swift).
    const problem = new CableClip(p).problem;
    if (problem !== null && options?.ignoreExportProblem !== true) throw new CoreFailure('export-blocked', problem);
    return run(options, () => single(clipFilename(p), 'model/stl', binarySTL(CableClipKit.generate(p, qualityOf(options)).printView)));
  },
};

const stl: StlGeometryApi = {
  // STLImportView.swift:53
  open(bytes, options) {
    return run(options, () => {
      const imported = open(bytes);
      return {
        mesh: toMeshBuffers(imported.mesh),
        parameters: imported.parameters,
        restoredSettings: imported.restoredSettings,
        notes: imported.notes,
        editable: toMeshBuffers(generate(imported.parameters)),
      };
    });
  },
};

export const core: CoreApi = {
  implementation: 'real',
  async prepare(loader: AssetLoader) {
    fonts = await loadFontSet(loader);
    textRasterizer = createTextRasterizer(fonts);
  },
  balloon: { ...parameters.balloon, ...balloon },
  basket: { ...parameters.basket, ...basket },
  ring: { ...parameters.ring, ...ring },
  cloud: { ...parameters.cloud, ...cloud },
  figure: { ...parameters.figure, ...figure },
  clip: { ...parameters.clip, ...clip },
  stl: { ...parameters.stl, ...stl },
  lampSettings: parameters.lampSettings,
};
