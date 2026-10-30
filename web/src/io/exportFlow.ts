// The shape of every Mac `export()`: guard, commit, snapshot, save panel, then generate and write
// away from the UI, with `exporting` on meanwhile. Nothing cancels a running generation.
//
// The save panel is ExportDialog plus, where the browser has it, the system's file picker. The
// picker needs the user's click, so `confirmExport` calls it before its first `await`.

import { create } from 'zustand';
import { toCoreError } from '../core/api';
import { ioClient, useBalloonStore, useBasketStore, useClipStore, useCloudStore, useFigureStore, useRingStore, useSunStore } from '../stores';
import type { ExportInputs, PartKey } from '../worker/protocol';
import { exportPanel, fileNameFromField, type ExportPanel } from './exportTable';

/** The File System Access API, which TypeScript's DOM library does not declare yet. */
interface SaveFilePickerOptions {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption: boolean;
}
type ShowSaveFilePicker = (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

interface PendingExport {
  panel: ExportPanel;
  /** Generates and records the file under this name. */
  run(filename: string, target: Promise<FileSystemFileHandle> | null): Promise<void>;
  finish(): void;
}

/** What ExportDialog shows; null while no panel is open. */
export const useExportPanel = create<{ pending: PendingExport | null }>(() => ({ pending: null }));

// Looked up when needed: editor tests mock the stores with only the parts they render.
const storeOf = (part: PartKey) => {
  switch (part) {
    case 'balloon':
      return useBalloonStore;
    case 'basket':
      return useBasketStore;
    case 'ring':
      return useRingStore;
    case 'cloud':
      return useCloudStore;
    case 'sun':
      return useSunStore;
    case 'figure':
      return useFigureStore;
    case 'clip':
      return useClipStore;
  }
};

/** `Uint8Array<ArrayBuffer>`: what comes back from the worker owns its transferred buffer. */
type OwnedBytes = Uint8Array<ArrayBuffer>;

/** Long enough for the browser to start the download; Safari drops one revoked right after the click. */
const DOWNLOAD_URL_LIFETIME_MS = 60_000;

const download = (bytes: OwnedBytes, filename: string, mime: string): void => {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  // Firefox only follows an anchor that is in the document.
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
};

/** `createWritable` writes to a swap file, so a failed write leaves the target as it was (`.atomic` on the Mac). */
const write = async (handle: FileSystemFileHandle, bytes: OwnedBytes): Promise<void> => {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
  } catch (error) {
    await writable.abort();
    throw error;
  }
  await writable.close();
};

const isAbort = (error: unknown): boolean => (error as { name?: unknown } | null)?.name === 'AbortError';

/** Opens the save panel for a snapshot already taken. Resolves when the export is over or was cancelled. */
export const presentExport = <K extends PartKey>(part: K, input: ExportInputs[K]): Promise<void> => {
  if (useExportPanel.getState().pending !== null) return Promise.resolve();
  const panel = exportPanel(part, input);
  const model = storeOf(part);
  const run = async (filename: string, target: Promise<FileSystemFileHandle> | null): Promise<void> => {
    const { setExporting, setExported, setError } = model.getState();
    let handle: FileSystemFileHandle | null;
    try {
      handle = await target;
    } catch (error) {
      if (!isAbort(error)) setError(toCoreError(error).message);
      return;
    }
    setExporting(true);
    try {
      const result = await ioClient.export(part, input);
      const bytes = result.files[0]!.bytes as OwnedBytes;
      if (handle !== null) {
        await write(handle, bytes);
        setExported({ filename: handle.name, mode: 'saved' });
      } else {
        download(bytes, filename, panel.mime);
        setExported({ filename, mode: 'downloaded' });
      }
    } catch (error) {
      setError(toCoreError(error).message);
    }
    setExporting(false);
  };
  return new Promise((resolve) => useExportPanel.setState({ pending: { panel, run, finish: resolve } }));
};

/** Mod+E and the export buttons: guard, commit, snapshot, then the save panel. A figure exports alone unless `variant` says otherwise. */
export const startExport = async (part: PartKey, variant: 'single' | 'set' = 'single'): Promise<void> => {
  const snapshot = storeOf(part).getState().beginExport();
  if (snapshot === null) return;
  await (part === 'figure'
    ? presentExport('figure', { parameters: snapshot as ExportInputs['figure']['parameters'], variant })
    : presentExport(part, snapshot as ExportInputs[typeof part]));
};

/** The panel's prompt button. Must run inside the click: the picker opens synchronously from here. */
export const confirmExport = (fieldText: string): Promise<void> => {
  const { pending } = useExportPanel.getState();
  if (pending === null) return Promise.resolve();
  const { panel, run, finish } = pending;
  const filename = fileNameFromField(fieldText, panel.extension);
  if (filename === null) return Promise.resolve();
  const showPicker = (window as Window & { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;
  const target =
    showPicker?.call(window, {
      suggestedName: filename,
      types: [{ description: `${panel.extension.toUpperCase()} file`, accept: { [panel.mime]: [`.${panel.extension}`] } }],
      excludeAcceptAllOption: true,
    }) ?? null;
  useExportPanel.setState({ pending: null });
  return run(filename, target).finally(finish);
};

/** Esc or the Cancel button. */
export const cancelExport = (): void => {
  const { pending } = useExportPanel.getState();
  if (pending === null) return;
  useExportPanel.setState({ pending: null });
  pending.finish();
};
