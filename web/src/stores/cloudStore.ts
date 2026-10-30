// CloudModel (CloudEditor.swift:5-116). One store per `WallLampKind`; both keep their own
// parameters and settings key, and `apply` forces the kind whatever arrives.

import {
  SETTINGS_KEYS,
  type CableSide,
  type CloudParameters,
  type CloudStyle,
  type LampSurface,
  type SunStyle,
  type WallLampKind,
} from '../core/types';
import { createPartStore, type PartStore } from './createPartStore';
import type { StoreDeps } from './deps';

export interface CloudExtras {
  readonly kind: WallLampKind;
  selectStyle(style: CloudStyle): void;
  selectSunStyle(style: SunStyle): void;
  mirror(mirrored: boolean): void;
  /** Moves an outlet to `side`, unless an earlier outlet is already there (CloudEditor.swift:65). */
  selectCableSide(side: CableSide, outlet?: number): void;
  /** Turning an outlet on adds it; turning it off removes it and the ones after it. */
  setCableOutlet(index: number, enabled: boolean): void;
  setCableOutletCount(count: number): void;
  setStrainRelief(wanted: boolean): void;
  setNailInsert(wanted: boolean): void;
  selectSurface(surface: LampSurface): void;
}

export type CloudStore = PartStore<WallLampKind, CloudParameters, CloudExtras>;

export const createCloudStore = (kind: WallLampKind, deps: StoreDeps): CloudStore => {
  const { cloud } = deps.core;
  return createPartStore<WallLampKind, CloudParameters, CloudExtras>(
    {
      part: kind,
      key: kind === 'sun' ? SETTINGS_KEYS.sun : SETTINGS_KEYS.cloud,
      codec: cloud.codec,
      normalize: (p) => cloud.normalize({ ...p, kind }),
      fallback: cloud.defaults(kind),
      resetTarget: () => cloud.defaults(kind),
      previewInput: (s) => s.parameters,
      extend: ({ edit }) => {
        const setCableOutletCount = (count: number) => edit((p) => cloud.setCableOutletCount(p, count));
        return {
          kind,
          selectStyle: (style) => edit((p) => ({ ...p, style })),
          selectSunStyle: (sunStyle) => edit((p) => ({ ...p, sunStyle })),
          mirror: (mirrored) => edit((p) => ({ ...p, mirrored })),
          selectCableSide: (side, outlet = 0) =>
            edit((p) => (cloud.derived(p).cableSides.slice(0, outlet).includes(side) ? p : cloud.selectCableSide(p, side, outlet))),
          setCableOutlet: (index, enabled) => setCableOutletCount(enabled ? index + 1 : index),
          setCableOutletCount,
          setStrainRelief: (strainRelief) => edit((p) => ({ ...p, strainRelief })),
          setNailInsert: (nailInsert) => edit((p) => ({ ...p, nailInsert })),
          selectSurface: (surface) => edit((p) => ({ ...p, surface })),
        };
      },
    },
    deps,
  );
};
