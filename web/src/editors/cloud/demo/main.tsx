// Not part of the app: only the dev server serves this page (vite build starts from web/index.html).
// Run `npm run dev` and open http://localhost:5173/balloon-studio/src/editors/cloud/demo/index.html
// or the same with `?kind=sun`.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CloudEditor from '..';

const kind = new URLSearchParams(location.search).get('kind') === 'sun' ? 'sun' : 'cloud';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudEditor kind={kind} />
  </StrictMode>,
);
