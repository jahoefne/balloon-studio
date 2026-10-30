// Ported from mac/Sources/BalloonStudio/LampSurface.swift @ cbda68d.
//
// FROZEN SIGNATURES (WP-K4a, part 1). WP-K4c fills every function that throws 'WP-K4c', from:
//   - LampSurfaceGenerator.height (:15-17) and the private Field (:19-132)
//   - sculpt (:138-191, with the Float32 rounding of :186-188), classify (:195-218),
//     refine (:222-292, the shorter-diagonal rule of :281)
// `LampSurface` and its title are LAMP_SURFACES and LAMP_SURFACE_TITLE in core/types.ts.
// Keep names and shapes: `CloudGenerator.generate` of part 2 calls `sculpt`. A change here is a
// small PR of its own, with the K4 sessions told.
// See cloudGeometry.ts for the rule on module-level reads across this cluster.

import type { Quality } from '../api';
import type { BalloonMesh } from '../geometry/mesh';
import type { Point3 } from '../geometry/point3';
import type { CloudParameters } from '../types';

/**
 * Shapes the diffuser only. Each part of the silhouette is inflated into a
 * dome that leaves the side wall at the outline, so the front is a rounded
 * body rather than a relief on a plate. A sun's rays rise from their tips
 * towards a dome in the middle. The rim over the seating face is solid;
 * inside the skirt the shell follows the outside.
 */
export const LampSurfaceGenerator = {
  height(_point: Point3, _p: CloudParameters): number {
    throw new Error('WP-K4c');
  },
  /**
   * Input has its original face at Z=0, skirt pointing up, and assembly XY.
   * Output rests on its skirt tips with the sculpted face pointing up.
   */
  sculpt(_input: BalloonMesh, _p: CloudParameters, _quality: Quality): BalloonMesh {
    throw new Error('WP-K4c');
  },
};
