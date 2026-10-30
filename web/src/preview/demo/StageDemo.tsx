// Not part of the app. Run `npm run dev` and open
// http://localhost:5173/balloon-studio/src/preview/demo/index.html
//
// Without arguments it shows the stub core's balloon, ring and cloud with every Stage toggle.
// With `?case=<url>` it shows one mesh dumped from Swift, full-window and without controls, for
// the side-by-side with real SceneKit renders (see comparison/README.md):
// `<url>.json` holds the Stage props and sizes, `<url>.bin` the buffers.

import { useEffect, useMemo, useState } from 'react';
import { core } from '#core';
import type { MeshBuffers, Vec3 } from '../../core/types';
import { calibrated } from '../colors';
import { BODY_MATERIAL } from '../scene';
import { Stage, type StageProps } from '../Stage';

type DemoPart = 'balloon' | 'ring' | 'cloud';

function stubProps(part: DemoPart, reflected: boolean, exploded: boolean, colored: boolean): StageProps {
  const common = { geometryKey: `${part}:${reflected}:${exploded}:${colored}`, showPlate: true, wireframe: false, resetCamera: 0, cutaway: false, inspectOpening: false, neckDiameter: 0 };
  if (part === 'balloon') {
    const parameters = core.balloon.defaults;
    const { mesh } = core.balloon.preview({ parameters, pattern: core.balloon.pattern.defaults, purge: core.balloon.purge.defaults });
    // BalloonStudioApp.swift:509-514, Saffron
    return { ...common, mesh, color: calibrated(0.86, 0.43, 0.18), neckDiameter: parameters.neckDiameter, neckHeight: parameters.neckHeight, filledNeck: !parameters.hollow };
  }
  if (part === 'ring') {
    const preview = core.ring.preview({ ...core.ring.presets.large, reflectedLED: reflected });
    const mesh = exploded ? preview.exploded : preview.assembled;
    // RingEditor.swift:298-303
    return {
      ...common,
      mesh,
      color: reflected ? [0.9, 0.9, 0.9] : calibrated(0.73, 0.77, 0.7),
      compactObject: true,
      faceColors: colored ? mesh.faceColors : undefined,
      detailColor: calibrated(0.35, 0.53, 0.46),
      objectName: 'mobile ring',
      sharpEdges: true,
    };
  }
  const preview = core.cloud.preview(core.cloud.defaults('cloud'));
  const mesh = exploded ? preview.views.exploded : preview.views.assembled;
  // CloudEditor.swift:409-416, assembly views
  return {
    ...common,
    mesh,
    color: [0.36, 0.36, 0.36],
    showPlate: false,
    compactObject: true,
    faceColors: colored ? mesh.faceColors : undefined,
    detailColor: [0.96, 0.96, 0.96],
    accentColor: calibrated(0.93, 0.45, 0.2),
    hardwareColor: calibrated(0.25, 0.58, 0.8),
    objectName: 'cloud lamp',
    sharpEdges: true,
  };
}

function StubDemo() {
  const [part, setPart] = useState<DemoPart>('balloon');
  const [reflected, setReflected] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [colored, setColored] = useState(true);
  const [showPlate, setShowPlate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [inspectOpening, setInspectOpening] = useState(false);
  const [inspectTop, setInspectTop] = useState(false);
  const [topDown, setTopDown] = useState(false);
  const [resetCamera, setResetCamera] = useState(0);
  const [mounted, setMounted] = useState(true);
  const props = useMemo(() => stubProps(part, reflected, exploded, colored), [part, reflected, exploded, colored]);
  const toggles: [string, boolean, (value: boolean) => void][] = [
    ['Reflected', reflected, setReflected],
    ['Exploded', exploded, setExploded],
    ['Face colors', colored, setColored],
    ['Build plate', showPlate, setShowPlate],
    ['Wireframe', wireframe, setWireframe],
    ['Cutaway', cutaway, setCutaway],
    ['Opening', inspectOpening, setInspectOpening],
    ['Hanger', inspectTop, setInspectTop],
    ['Top down', topDown, setTopDown],
    ['Mounted', mounted, setMounted],
  ];
  return (
    <div style={{ display: 'flex', height: '100%', font: '13px system-ui, sans-serif' }}>
      <aside style={{ width: 180, padding: 14, display: 'grid', alignContent: 'start', gap: 8 }}>
        <select aria-label="Part" value={part} onChange={(event) => setPart(event.target.value as DemoPart)}>
          <option value="balloon">Balloon</option>
          <option value="ring">Ring</option>
          <option value="cloud">Cloud</option>
        </select>
        {toggles.map(([label, value, set]) => (
          <label key={label}>
            <input type="checkbox" checked={value} onChange={(event) => set(event.target.checked)} /> {label}
          </label>
        ))}
        <button type="button" onClick={() => setResetCamera(resetCamera + 1)}>
          Reset view
        </button>
      </aside>
      <div style={{ flex: 1, margin: 14, borderRadius: 16, overflow: 'hidden' }}>
        {mounted && (
          <Stage
            {...props}
            showPlate={props.showPlate && showPlate}
            wireframe={wireframe}
            cutaway={cutaway}
            inspectOpening={inspectOpening}
            inspectTop={inspectTop}
            topDown={topDown}
            resetCamera={resetCamera}
          />
        )}
      </div>
    </div>
  );
}

interface DumpedCase {
  vertices: number;
  triangles: number;
  colors: number;
  dimensions: Vec3;
  stage: Omit<StageProps, 'mesh'>;
}

function DumpDemo({ url }: { url: string }) {
  const [loaded, setLoaded] = useState<{ mesh: MeshBuffers; stage: Omit<StageProps, 'mesh'> } | null>(null);
  useEffect(() => {
    void (async () => {
      const info = (await (await fetch(`${url}.json`)).json()) as DumpedCase;
      const buffer = await (await fetch(`${url}.bin`)).arrayBuffer();
      const positions = new Float32Array(buffer, 0, info.vertices * 3);
      const indices = new Uint32Array(buffer, positions.byteLength, info.triangles * 3);
      const faceColors = new Uint8Array(buffer, positions.byteLength + indices.byteLength, info.colors);
      setLoaded({ mesh: { positions, indices, faceColors, maxOverhang: 0, dimensions: info.dimensions }, stage: info.stage });
    })();
  }, [url]);
  if (!loaded) return null;
  return <Stage mesh={loaded.mesh} {...loaded.stage} faceColors={loaded.mesh.faceColors} />;
}

export function StageDemo() {
  const query = new URLSearchParams(location.search);
  const shininess = query.get('shininess');
  if (shininess !== null) BODY_MATERIAL.shininess = Number(shininess);
  const specular = query.get('specular');
  if (specular !== null) BODY_MATERIAL.specular = Number(specular);
  const dump = query.get('case');
  return dump ? <DumpDemo url={dump} /> : <StubDemo />;
}
