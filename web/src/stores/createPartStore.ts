// The model every part shares (WP-U3), after `apply` in BalloonModel, BasketModel, RingModel,
// CloudModel, FigureModel and CableClipModel: normalize, compare, store, save at once, and
// rebuild the preview after a short debounce. The Mac's cancelled `pending` Task becomes a
// request id: a result counts only while no newer rebuild has started.
//
// One difference from the Mac: its models generate the first preview synchronously in `init`.
// Here `bundle` starts null until `ensurePreview()`, which the app store calls for the part on
// screen, because one preview worker building all seven parts at load would block the first.

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { toCoreError, type Codec } from '../core/api';
import type { SettingsKey } from '../persistence/settingsStorage';
import type { PartKey, PreviewInputs, PreviewResults } from '../worker/protocol';
import type { StoreDeps } from './deps';

/** `Task.sleep` before each rebuild: BalloonStudioApp.swift:98, CloudEditor.swift:35, 60 ms in the other models. */
export const DEBOUNCE_MS: Readonly<Record<PartKey, number>> = {
  balloon: 100,
  basket: 60,
  ring: 60,
  cloud: 100,
  sun: 100,
  figure: 60,
  clip: 60,
};

/** The web's `exportedURL` (plan §6): the footer says "<Prefix> saved · <filename>" or "… downloaded · <filename>". */
export interface ExportedFile {
  filename: string;
  mode: 'saved' | 'downloaded';
}

export interface PartState<K extends PartKey, P> {
  readonly part: K;
  parameters: P;
  /** The last finished preview; null until the first one arrives. */
  bundle: PreviewResults[K] | null;
  revision: number;
  updating: boolean;
  exporting: boolean;
  exported: ExportedFile | null;
  error: string | null;
  apply(value: P): void;
  /** `binding(key)` of the Mac models. */
  setField<F extends keyof P>(key: F, value: P[F]): void;
  /** "Reset Current Part": commits the field being edited, then applies the part's reset target. */
  reset(): void;
  /** Builds the preview right away if there is none and none is on its way. */
  ensurePreview(): void;
  /** The start of each Mac `export()`: `guard !exporting`, commit, snapshot. Null when export must not start. */
  beginExport(): PreviewInputs[K] | null;
  setExporting(exporting: boolean): void;
  setExported(exported: ExportedFile | null): void;
  setError(error: string | null): void;
}

export type PartStore<K extends PartKey, P, X = object> = UseBoundStore<StoreApi<PartState<K, P> & X>>;

/** What a part's own actions build on. */
export interface PartTools<K extends PartKey, P, X> {
  get(): PartState<K, P> & X;
  set(partial: Partial<PartState<K, P> & X>): void;
  /** Commit, then apply a change of the now current parameters: the shape of most Mac model actions. */
  edit(change: (parameters: P) => P): void;
  rebuild(): void;
  /** `pending?.cancel()` without starting anything new. */
  cancelPreview(): void;
}

export interface PartStoreConfig<K extends PartKey, P extends object, X> {
  part: K;
  key: SettingsKey;
  codec: Pick<Codec<P>, 'decode' | 'encode'>;
  normalize(value: P): P;
  /** What a first launch or undecodable settings start from, before normalizing. */
  fallback: P;
  resetTarget(parameters: P): P;
  previewInput(state: PartState<K, P> & X): PreviewInputs[K];
  /** Extra state that follows new parameters, set together with them. */
  onParameters?(parameters: P, previous: PartState<K, P> & X): Partial<X>;
  /** Extra state that follows a finished preview. */
  onBundle?(bundle: PreviewResults[K]): Partial<X>;
  /** A further export guard, after the commit. */
  canExport?(parameters: P): boolean;
  extend(tools: PartTools<K, P, X>, initial: P): X;
}

/** Swift's synthesized `==` on the flat parameter structs: `0 == -0`, `NaN != NaN`. */
const sameParameters = <P extends object>(a: P, b: P): boolean => {
  const keys = Object.keys(a) as (keyof P)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

export const createPartStore = <K extends PartKey, P extends object, X extends object>(
  config: PartStoreConfig<K, P, X>,
  deps: Pick<StoreDeps, 'previewClient' | 'settings' | 'commitEditing'>,
): PartStore<K, P, X> =>
  create<PartState<K, P> & X>()((setState, get) => {
    const set = setState as (partial: Partial<PartState<K, P>> | Partial<X>) => void;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latest = 0;

    const cancelPreview = () => {
      clearTimeout(timer);
      timer = undefined;
      latest += 1;
    };

    const request = (id: number, input: PreviewInputs[K]) => {
      deps.previewClient.preview(config.part, input).then(
        (result) => {
          if (id !== latest) return;
          if (result.status === 'current') {
            const bundle = result.value;
            set({ bundle, revision: get().revision + 1, updating: false, ...config.onBundle?.(bundle) });
          } else {
            // Every newer request bumps `latest`, so the latest one only gets here when the worker stopped.
            set({ updating: false });
          }
        },
        (error: unknown) => {
          if (id !== latest) return;
          set({ error: toCoreError(error).message, updating: false });
        },
      );
    };

    const rebuild = () => {
      cancelPreview();
      const id = latest;
      const input = config.previewInput(get());
      set({ updating: true });
      timer = setTimeout(() => request(id, input), DEBOUNCE_MS[config.part]);
    };

    const edit = (change: (parameters: P) => P) => {
      deps.commitEditing();
      get().apply(change(get().parameters));
    };

    const initial = config.normalize(deps.settings.loadSetting(config.key, config.codec.decode, config.fallback));

    const base: PartState<K, P> = {
      part: config.part,
      parameters: initial,
      bundle: null,
      revision: 0,
      updating: false,
      exporting: false,
      exported: null,
      error: null,
      apply(value) {
        const parameters = config.normalize(value);
        const previous = get();
        if (sameParameters(parameters, previous.parameters)) return;
        set({ parameters, exported: null, ...config.onParameters?.(parameters, previous) });
        deps.settings.saveSetting(config.key, config.codec.encode, parameters);
        rebuild();
      },
      setField(key, value) {
        get().apply({ ...get().parameters, [key]: value });
      },
      reset() {
        edit(config.resetTarget);
      },
      ensurePreview() {
        const state = get();
        if (state.bundle !== null || state.updating) return;
        cancelPreview();
        set({ updating: true });
        request(latest, config.previewInput(state));
      },
      beginExport() {
        if (get().exporting) return null;
        deps.commitEditing();
        const state = get();
        if (config.canExport && !config.canExport(state.parameters)) return null;
        return config.previewInput(state);
      },
      setExporting: (exporting) => set({ exporting }),
      setExported: (exported) => set({ exported }),
      setError: (error) => set({ error }),
    };

    return { ...base, ...config.extend({ get, set: setState as PartTools<K, P, X>['set'], edit, rebuild, cancelPreview }, initial) };
  });
