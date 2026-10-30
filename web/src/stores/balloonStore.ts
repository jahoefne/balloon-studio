// BalloonModel (BalloonStudioApp.swift:9-194): parameters plus the pattern and purge settings
// that travel with them. The Mac's unpainted-mesh cache (`unpainted`, `meshParameters`) saves
// time on pattern-only rebuilds and changes no result; it belongs in the preview worker.

import { SETTINGS_KEYS, type BalloonParameters, type ImportedBalloon, type PatternSettings, type PurgeEstimate, type PurgeSettings } from '../core/types';
import { roundHalfAwayFromZero } from '../ui/format';
import { createPartStore, type PartStore } from './createPartStore';
import type { StoreDeps } from './deps';

export interface BalloonExtras {
  pattern: PatternSettings;
  purge: PurgeSettings;
  /** One color group per triangle of `bundle.mesh`; null until the first preview. */
  faceColors: Uint8Array | null;
  /** Null until the first preview. */
  estimate: PurgeEstimate | null;
  openedSTLName: string | null;
  importRevision: number;
  setPanels(value: number): void;
  setPattern(value: PatternSettings): void;
  setPurge(value: PurgeSettings): void;
  applyShape(shape: BalloonParameters): void;
  addStringHoles(clearance: number): void;
  /** `editable` of the import is the mesh on screen until the next rebuild. */
  loadSTL(imported: ImportedBalloon, name: string): void;
  uses3MF(): boolean;
  exportFormat(): 'STL' | '3MF';
}

export type BalloonStore = PartStore<'balloon', BalloonParameters, BalloonExtras>;

export const createBalloonStore = (deps: StoreDeps): BalloonStore => {
  const { core, settings, commitEditing } = deps;
  const { balloon } = core;
  const savePattern = (pattern: PatternSettings) => settings.saveSetting(SETTINGS_KEYS.pattern, balloon.pattern.codec.encode, pattern);
  const savePurge = (purge: PurgeSettings) => settings.saveSetting(SETTINGS_KEYS.purge, balloon.purge.codec.encode, purge);

  return createPartStore<'balloon', BalloonParameters, BalloonExtras>(
    {
      part: 'balloon',
      key: SETTINGS_KEYS.balloon,
      codec: balloon.codec,
      normalize: balloon.normalize,
      fallback: balloon.presets.classic,
      resetTarget: () => balloon.presets.classic,
      previewInput: (s) => ({ parameters: s.parameters, pattern: s.pattern, purge: s.purge }),
      // As on the Mac the renormalized pattern is not saved here; the next launch normalizes it again.
      onParameters: (p, previous) => ({ pattern: balloon.pattern.normalize(previous.pattern, p) }),
      onBundle: (bundle) => ({ faceColors: bundle.mesh.faceColors ?? null, estimate: bundle.estimate }),
      extend: ({ get, set, edit, rebuild, cancelPreview }, initial) => ({
        pattern: balloon.pattern.normalize(
          settings.loadSetting(SETTINGS_KEYS.pattern, balloon.pattern.codec.decode, balloon.pattern.defaults),
          initial,
        ),
        purge: balloon.purge.normalize(settings.loadSetting(SETTINGS_KEYS.purge, balloon.purge.codec.decode, balloon.purge.defaults)),
        faceColors: null,
        estimate: null,
        openedSTLName: null,
        importRevision: 0,
        setPanels(value) {
          get().apply({ ...get().parameters, panels: roundHalfAwayFromZero(value) });
        },
        setPattern(value) {
          const pattern = balloon.pattern.normalize(value, get().parameters);
          set({ pattern, exported: null });
          savePattern(pattern);
          rebuild();
        },
        setPurge(value) {
          const purge = balloon.purge.normalize(value);
          set({ purge, exported: null });
          savePurge(purge);
          rebuild();
        },
        applyShape(shape) {
          edit((current) => ({
            ...shape,
            hollow: current.hollow,
            wallThickness: current.wallThickness,
            stringHoles: current.stringHoles,
            cordClearance: current.cordClearance,
            hangingLoop: current.hangingLoop,
            hangingClearance: current.hangingClearance,
            hangingThickness: current.hangingThickness,
            hangingWall: current.hangingWall,
            hangingFillet: current.hangingFillet,
            hangingCrownThickness: current.hangingCrownThickness,
          }));
        },
        addStringHoles(clearance) {
          edit((current) => ({ ...current, stringHoles: true, cordClearance: clearance }));
        },
        loadSTL(imported, name) {
          commitEditing();
          const parameters = balloon.normalize(imported.parameters);
          const pattern = balloon.pattern.normalize(balloon.pattern.defaults, parameters);
          cancelPreview();
          const faceColors = new Uint8Array(imported.editable.indices.length / 3);
          const estimate: PurgeEstimate = { mixedLayers: 0, minimumChanges: 0, maximumChanges: 0, minimumGrams: 0, maximumGrams: 0 };
          const { purge, revision, importRevision } = get();
          set({
            parameters,
            pattern,
            bundle: { parameters, pattern, purge, mesh: { ...imported.editable, faceColors }, estimate },
            faceColors,
            estimate,
            updating: false,
            revision: revision + 1,
            openedSTLName: name,
            importRevision: importRevision + 1,
            exported: null,
          });
          settings.saveSetting(SETTINGS_KEYS.balloon, balloon.codec.encode, parameters);
          savePattern(pattern);
        },
        uses3MF: () => balloon.exportFormat(get().pattern) === '3mf',
        exportFormat: () => (balloon.exportFormat(get().pattern) === '3mf' ? '3MF' : 'STL'),
      }),
    },
    deps,
  );
};
