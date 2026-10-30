// Not part of the app: nothing in src/main.tsx reaches this file, and the build's only input is
// web/index.html. Run `npm run dev` and open
// http://localhost:5173/balloon-studio/src/editors/figure/demo/index.html?demo=figure
//
//   ?demo=figure | clip    which editor
//   ?core=real             build previews with the ported generators (core/figures, core/clip) on
//                          the main thread, for the side-by-side with the Mac app. Without it the
//                          previews come from the worker's stub core, as in the app until WP-K9.
//
// The export buttons show the footer states without a file flow (WP-U9): "Preparing …" for a
// moment, then the downloaded line.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { core } from '#core/parameters';
import { CableClipKit } from '../../../core/clip/cableClip';
import { figureHangingView, figureHoles, figureHolesWanted, generateFigure } from '../../../core/figures/figureGeometry';
import type { BalloonMesh } from '../../../core/geometry/mesh';
import type { CableClipParameters, ClipPreview, FigureParameters, FigurePreview, MeshBuffers } from '../../../core/types';
import { settingsStorage } from '../../../persistence/settingsStorage';
import { previewClient, ioClient, useClipStore, useFigureStore } from '../../../stores';
import type { ClipStore } from '../../../stores/clipStore';
import type { PreviewClient } from '../../../stores/deps';
import type { FigureStore } from '../../../stores/figureStore';
import { createStudio } from '../../../stores/studio';
import { commitEditing } from '../../../ui';
import type { Latest } from '../../../worker/client';
import CableClipEditor from '../../clip';
import FigureEditor from '..';

const buffers = (mesh: BalloonMesh, colors?: readonly number[]): MeshBuffers => {
  const { dimensions } = mesh;
  return {
    positions: new Float32Array(mesh.vertices.flatMap((v) => [v.x, v.y, v.z])),
    indices: new Uint32Array(mesh.triangles.flatMap((t) => [t.a, t.b, t.c])),
    ...(colors ? { faceColors: new Uint8Array(colors) } : {}),
    maxOverhang: mesh.maxOverhang,
    dimensions,
  };
};

const realFigure = (p: FigureParameters): FigurePreview => {
  const body = generateFigure(p);
  const hanging = figureHangingView(body);
  return {
    parameters: body.parameters,
    printMesh: buffers(body.mesh),
    hangingMesh: buffers(hanging.mesh, hanging.colors),
    width: body.width,
    hangingHole: body.hangingHole,
    chainHole: body.chainHole,
    holesWanted: figureHolesWanted(body),
    holes: figureHoles(body),
  };
};

const realClip = (p: CableClipParameters): ClipPreview => {
  const kit = CableClipKit.generate(p);
  const assembly = kit.assembly();
  return {
    parameters: kit.parameters,
    printMesh: buffers(kit.printView),
    assemblyMesh: buffers(assembly.mesh, assembly.colors),
    // The parameter API computes the same numbers; only the mesh needs the real kit.
    clip: core.clip.clip(p),
  };
};

const realPreviewClient: PreviewClient = {
  preview: (part, input) => {
    const value = part === 'figure' ? realFigure(input as FigureParameters) : part === 'clip' ? realClip(input as CableClipParameters) : null;
    if (value === null) return previewClient.preview(part, input);
    return Promise.resolve({ status: 'current', value } as Latest<never>);
  },
};

const query = new URLSearchParams(location.search);
const studio = query.get('core') === 'real' ? createStudio({ core, previewClient: realPreviewClient, ioClient, settings: settingsStorage, commitEditing: () => commitEditing() }) : null;
const figureStore: FigureStore = studio?.figure ?? useFigureStore;
const clipStore: ClipStore = studio?.clip ?? useClipStore;

/** What WP-U9 will do around the real file flow. */
const pretendExport = (store: FigureStore | ClipStore, filename: string) => {
  const { setExporting, setExported } = store.getState();
  setExporting(true);
  setTimeout(() => {
    setExporting(false);
    setExported({ filename, mode: 'downloaded' });
  }, 800);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {query.get('demo') === 'clip' ? (
      <CableClipEditor store={clipStore} onExport={(p) => pretendExport(clipStore, core.clip.filename(p))} />
    ) : (
      <FigureEditor
        store={figureStore}
        onExport={({ parameters, variant }) => pretendExport(figureStore, variant === 'set' ? core.figure.setFilename(parameters) : core.figure.filename(parameters))}
      />
    )}
  </StrictMode>,
);
