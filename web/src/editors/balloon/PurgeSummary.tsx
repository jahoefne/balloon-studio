import { printfFixed } from '../../core/swift/format';
import type { PurgeEstimate } from '../../core/types';
import { useBalloonStore } from '../../stores';
import { Icon } from '../../ui';

// PurgeSummary (PatternEditor.swift:113-140). The Mac always has an estimate; here the first
// preview brings it.

const NO_ESTIMATE: PurgeEstimate = { mixedLayers: 0, minimumChanges: 0, maximumChanges: 0, minimumGrams: 0, maximumGrams: 0 };

const grams = (e: PurgeEstimate): string =>
  Math.abs(e.maximumGrams - e.minimumGrams) < 0.05 ? `≈ ${printfFixed(e.maximumGrams, 1)} g` : `≈ ${printfFixed(e.minimumGrams, 1)}–${printfFixed(e.maximumGrams, 1)} g`;

const changes = (e: PurgeEstimate): string =>
  e.minimumChanges === e.maximumChanges ? `${e.minimumChanges} color ${e.minimumChanges === 1 ? 'change' : 'changes'}` : `${e.minimumChanges}–${e.maximumChanges} color changes`;

export function PurgeSummary() {
  const estimate = useBalloonStore((state) => state.estimate) ?? NO_ESTIMATE;
  const updating = useBalloonStore((state) => state.updating);
  return (
    <div className="balloon-purge" data-testid="purgeSummary">
      <div className="balloon-purge__head">
        <span className="balloon-purge__title">
          <Icon name="arrow.triangle.2.circlepath" size={13} />
          P2S · estimated filament poop
        </span>
        <span className="balloon-purge__grams">{updating ? 'Updating…' : grams(estimate)}</span>
      </div>
      <p className="balloon-purge__changes">
        {changes(estimate)} · {estimate.mixedLayers} layers using both colors
      </p>
      <p className="balloon-caption">
        Change-related chute waste only. Range reflects color ordering; excludes startup purge, prime tower and supports. Flushing into infill can reduce it. Preview estimate; confirm
        in Bambu Studio after slicing.
      </p>
    </div>
  );
}
