// Not part of the app: `vite build` starts at web/index.html and never reaches this page.
// Run `npm run dev` and open
// http://localhost:5173/balloon-studio/src/editors/ring/demo/index.html?part=ring (or ?part=basket).
// `VITE_CORE=real npm run dev` shows real meshes once WP-K9 is in. The line at the top shows what
// the cross-model buttons did to the balloon.

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useBalloonStore } from '../../../stores';
import { SegmentedControl } from '../../../ui';
import BasketEditor from '../../basket';
import RingEditor from '..';

function Demo() {
  const [part, setPart] = useState(new URLSearchParams(location.search).get('part') === 'basket' ? 'basket' : 'ring');
  const balloon = useBalloonStore((state) => state.parameters);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 980, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 22px', font: '11px var(--font-mono)' }}>
        <style>{'.ring-demo-tabs { flex: 0 0 180px; }'}</style>
        <SegmentedControl
          label="Part"
          className="ring-demo-tabs"
          options={[
            { value: 'basket', label: 'Basket' },
            { value: 'ring', label: 'Ring' },
          ]}
          value={part}
          onChange={setPart}
        />
        <span>
          balloon: stringHoles={String(balloon.stringHoles)} cordClearance={balloon.cordClearance} hangingLoop={String(balloon.hangingLoop)} hangingClearance={balloon.hangingClearance}
        </span>
      </div>
      <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex' }}>{part === 'basket' ? <BasketEditor /> : <RingEditor />}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
