// Ported from mac/Tests/PatternTests.swift @ cbda68d (lines 8-14: motifCount).
import type { BalloonMesh } from '../geometry/mesh';
import type { Triangle } from '../geometry/point3';

/** The parts of PaintedBalloon (WP-K3) that motifCount reads. */
export interface PaintedMesh {
  mesh: BalloonMesh;
  colors: ArrayLike<number>;
}

/** Number of connected detail-colour (colour 1) regions. */
export function motifCount(painted: PaintedMesh): number {
  const parents = new Int32Array(painted.mesh.vertices.length);
  for (let i = 0; i < parents.length; i++) parents[i] = i;
  const used = new Set<number>();
  const root = (i: number): number => {
    let n = i;
    while (parents[n] !== n) {
      parents[n] = parents[parents[n] as number] as number;
      n = parents[n] as number;
    }
    return n;
  };
  painted.mesh.triangles.forEach((t: Triangle, i) => {
    if (painted.colors[i] !== 1) return;
    const a = root(t.a);
    const b = root(t.b);
    const c = root(t.c);
    parents[b] = a;
    parents[c] = a;
    used.add(t.a);
    used.add(t.b);
    used.add(t.c);
  });
  const roots = new Set<number>();
  for (const i of used) roots.add(root(i));
  return roots.size;
}
