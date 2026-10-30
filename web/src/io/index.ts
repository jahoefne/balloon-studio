// Placeholder for WP-U9, which replaces this file's body with the export table, ExportDialog
// and the writing of files. Export buttons and Mod+E already go through `startExport`.

import { useBalloonStore, useBasketStore, useClipStore, useCloudStore, useFigureStore, useRingStore, useSunStore } from '../stores';
import type { PartKey } from '../worker/protocol';

const stores = {
  balloon: useBalloonStore,
  basket: useBasketStore,
  ring: useRingStore,
  cloud: useCloudStore,
  sun: useSunStore,
  figure: useFigureStore,
  clip: useClipStore,
};

// Long enough to see "Preparing …" in the footer.
const PLACEHOLDER_MS = 400;

/** The start of each Mac `export()`: guard, commit, snapshot; then runs `exporting` without writing a file. */
export async function startExport(part: PartKey): Promise<void> {
  const { getState } = stores[part];
  if (getState().beginExport() === null) return;
  getState().setExporting(true);
  // TODO(WP-U9): show ExportDialog with the snapshot, generate in `ioClient`, write the file, set `exported`.
  await new Promise((resolve) => setTimeout(resolve, PLACEHOLDER_MS));
  getState().setExporting(false);
}
