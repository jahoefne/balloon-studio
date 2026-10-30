// The React face of mac/Sources/BalloonStudio/BalloonPreview.swift. Fills its parent; round the
// corners on the parent, as the Mac app does with `.clipShape(RoundedRectangle(cornerRadius:16))`.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createStageView } from './controls';
import { createStageController, stageLabel, type StageProps } from './controller';
import { createRenderer, createStageScene } from './scene';

export type { StageProps } from './controller';

// The scene background as SceneKit shows it; what the page sees until the first frame.
const hostStyle: CSSProperties = { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'rgb(24 31 41)' };
const fallbackStyle: CSSProperties = { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: 'white', font: '13px system-ui, sans-serif' };

export function Stage(props: StageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ReturnType<typeof createStageController> | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let renderer;
    try {
      renderer = createRenderer();
    } catch {
      setUnsupported(true);
      return;
    }
    const stage = createStageScene();
    const view = createStageView(hostRef.current!, stage, renderer);
    controllerRef.current = createStageController(stage, view);
    return () => {
      controllerRef.current = null;
      view.dispose();
      stage.dispose();
    };
  }, []);

  // No dependency list: like updateNSView it looks at everything on every render and acts on differences.
  useEffect(() => {
    controllerRef.current?.update(props);
  });

  return (
    <div ref={hostRef} style={hostStyle} role="img" aria-label={stageLabel(props)} data-testid="stage">
      {unsupported && <p style={fallbackStyle}>The 3D preview needs WebGL, which this browser doesn’t provide. You can still export the model.</p>}
    </div>
  );
}
