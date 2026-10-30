// `SunSilhouette` and `CloudSilhouette` (CloudEditor.swift:503-537) as SVG path data. They use the
// same profile as the printable shell and the LED template, through `core.cloud.radius`.

import { core } from '#core/parameters';
import type { CloudStyle, SunStyle } from '../../core/types';

export interface SilhouetteBox {
  width: number;
  height: number;
}

/** The frames Swift gives them: 70 pt high and 65 pt high with 3 pt side padding, in 130 pt cards. */
export const SUN_BOX: SilhouetteBox = { width: 110, height: 70 };
export const CLOUD_BOX: SilhouetteBox = { width: 104, height: 65 };

const pathData = (points: readonly (readonly [number, number])[]): string =>
  `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`;

export const sunSilhouettePath = (style: SunStyle, box: SilhouetteBox = SUN_BOX): string => {
  const ref = { kind: 'sun', sunStyle: style } as const;
  const scale = Math.min(box.width, box.height);
  const points = Array.from({ length: 480 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 480;
    const r = core.cloud.radius(a, ref, { inset: 0, width: 1 });
    return [box.width / 2 + r * Math.cos(a) * scale, box.height / 2 - r * Math.sin(a) * scale] as const;
  });
  return pathData(points);
};

export const cloudSilhouettePath = (style: CloudStyle, mirrored: boolean, box: SilhouetteBox = CLOUD_BOX): string => {
  const ref = { kind: 'cloud', style, mirrored } as const;
  const scale = Math.min(box.width, box.height / 0.71);
  const { lowY, highY } = core.cloud.profileExtent(ref);
  const centerY = (highY + lowY) / 2;
  const points = Array.from({ length: 240 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 240;
    const r = core.cloud.radius(a, ref, { inset: 0, width: 1 });
    return [box.width / 2 + r * Math.cos(a) * scale, box.height / 2 - (r * Math.sin(a) - centerY) * scale] as const;
  });
  return pathData(points);
};
