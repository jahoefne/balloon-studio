// What BalloonStudioApp and ContentView hold (BalloonStudioApp.swift:200-351): the chosen tab,
// not persisted, the Balloon tab's view toggles, which outlive a tab switch, and the actions
// that reach across models.

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { CloudParameters } from '../core/types';
import type { PartKey } from '../worker/protocol';
import type { BalloonStore } from './balloonStore';
import type { BasketStore } from './basketStore';
import type { ClipStore } from './clipStore';
import type { CloudStore } from './cloudStore';
import type { StoreDeps } from './deps';
import type { FigureStore } from './figureStore';
import type { ImportStore, OpenableFile } from './importStore';
import type { RingStore } from './ringStore';

/** `StudioPart` (BasketEditor.swift:5-8), in tab order. */
export const STUDIO_PARTS: readonly { key: PartKey; title: string }[] = [
  { key: 'balloon', title: 'Balloon' },
  { key: 'basket', title: 'Basket' },
  { key: 'ring', title: 'Ring' },
  { key: 'cloud', title: 'Cloud' },
  { key: 'sun', title: 'Sun' },
  { key: 'figure', title: 'Figures' },
  { key: 'clip', title: 'Cable clip' },
];

/** ContentView's `@State` (BalloonStudioApp.swift:304-310). */
export interface BalloonViewToggles {
  showPlate: boolean;
  wireframe: boolean;
  resetCamera: number;
  colorIndex: number;
  cutaway: boolean;
  inspectOpening: boolean;
  inspectTop: boolean;
}

export interface AppState {
  part: PartKey;
  balloonView: BalloonViewToggles;
  /** The one-time storage hint, for a toast. */
  storageWarning: string | null;
  /** Builds the preview of the part on screen; call once when the app mounts. */
  start(): void;
  selectPart(part: PartKey): void;
  setBalloonView(change: Partial<BalloonViewToggles>): void;
  setStorageWarning(warning: string | null): void;
  /** "Reset Current Part" */
  resetCurrentPart(): void;
  /** `loadLampSettings`: a sun goes to the sun tab, anything else to the cloud tab. */
  loadLampSettings(parameters: CloudParameters): void;
  /** "Use Editable Balloon" in the review sheet. */
  acceptReview(): void;
  /** Opens a chosen or dropped file; lamp settings go to `loadLampSettings`. */
  openFile(file: OpenableFile): Promise<void>;
}

export type AppStore = UseBoundStore<StoreApi<AppState>>;

export interface AppStoreParts {
  balloon: BalloonStore;
  basket: BasketStore;
  ring: RingStore;
  cloud: CloudStore;
  sun: CloudStore;
  figure: FigureStore;
  clip: ClipStore;
  importer: ImportStore;
}

export const createAppStore = (parts: AppStoreParts, deps: Pick<StoreDeps, 'commitEditing'>): AppStore => {
  const { importer, ...models } = parts;
  const store = create<AppState>()((set, get) => {
    const show = (part: PartKey) => {
      set({ part });
      models[part].getState().ensurePreview();
    };
    return {
      part: 'balloon',
      balloonView: { showPlate: true, wireframe: false, resetCamera: 0, colorIndex: 0, cutaway: false, inspectOpening: false, inspectTop: false },
      storageWarning: null,
      start: () => models[get().part].getState().ensurePreview(),
      selectPart(part) {
        deps.commitEditing();
        show(part);
      },
      setBalloonView: (change) => set({ balloonView: { ...get().balloonView, ...change } }),
      setStorageWarning: (storageWarning) => set({ storageWarning }),
      resetCurrentPart: () => models[get().part].getState().reset(),
      loadLampSettings(parameters) {
        deps.commitEditing();
        const part = parameters.kind === 'sun' ? 'sun' : 'cloud';
        models[part].getState().apply(parameters);
        show(part);
      },
      acceptReview() {
        const { review, setReview } = importer.getState();
        if (review === null) return;
        models.balloon.getState().loadSTL(review.imported, review.name);
        show('balloon');
        setReview(null);
      },
      openFile: (file) => importer.getState().open(file, get().loadLampSettings),
    };
  });
  // ContentView's `.onChange(of:model.importRevision)` (:342-344).
  models.balloon.subscribe((state, previous) => {
    if (state.importRevision === previous.importRevision) return;
    const { balloonView, setBalloonView } = store.getState();
    setBalloonView({ cutaway: false, inspectOpening: false, inspectTop: false, resetCamera: balloonView.resetCamera + 1 });
  });
  return store;
};
