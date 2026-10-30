import { STUDIO_PARTS } from '../stores';
import type { PartKey } from '../worker/protocol';

// A tab whose editor is not wired in yet (see the marked place in App.tsx).

export function PartPlaceholder({ part }: { part: PartKey }) {
  const title = STUDIO_PARTS.find((entry) => entry.key === part)?.title ?? part;
  return (
    <section className="app-placeholder" data-testid={`partPlaceholder-${part}`}>
      <h2 className="app-placeholder__title">{title}</h2>
      <p className="app-placeholder__text">This part’s editor is still on its way to the web version; its saved settings stay untouched.</p>
    </section>
  );
}
