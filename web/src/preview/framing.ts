// Ported from mac/Sources/BalloonStudio/BalloonPreview.swift:155-188 (`frame`) and the
// re-framing condition of `updateNSView` (:219-227). Pure, no DOM and no Three.js.
//
// All values are in Three.js/SceneKit world coordinates (y up), not model coordinates.
//
// SWIFT-DIFF: `SCNNode.look(at:)` takes the node's current up as its reference, so the consecutive
// calls in `frame` tilt the camera, and every further `frame` tilts it differently: on a fresh
// Coordinator hanger −6.5°, compact +1.8°, filled neck +36°; ten resets later −24°, −20°, +78°. That
// history is an accident, so this port keeps world y up in every view but top-down.

import type { Vec3 } from '../core/types';

export interface FramingInput {
  /** `mesh.dimensions.z` */
  height: number;
  neck: number;
  opening: boolean;
  compact: boolean;
  /** `max(dimensions.x, dimensions.y)` */
  width: number;
  top: boolean;
  neckHeight: number;
  filledNeck: boolean;
  topDown: boolean;
  minimumScale?: number;
}

export interface Framing {
  position: Vec3;
  target: Vec3;
  /** Half the visible height, like `SCNCamera.orthographicScale` with its vertical projection direction. */
  orthographicScale: number;
  /** The camera's reference up; orbiting stays around world y whatever it is (:185). */
  up: Vec3;
}

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** The branches run in Swift order: each later one overrides what it sets. */
export function frame(input: FramingInput): Framing {
  const { height, neck, opening, compact, width, top, neckHeight, filledNeck, topDown, minimumScale = 32 } = input;
  let position = opening ? vec(35, -160, 80) : vec(340, height * 0.5 + 210, 490);
  let target = opening ? vec(0, 0, 0) : vec(0, height * 0.48, 0);
  let orthographicScale = opening ? Math.max(24, neck * 0.7) : Math.max(145, height * 0.72);
  let up = vec(0, 1, 0);
  if (compact) {
    const flat = height < width * 0.1;
    position = vec(width * 2, height + width * (flat ? 2.5 : 1.2), width * 2.4);
    orthographicScale = flat ? width * 0.5 : Math.max(minimumScale, Math.max(width * 0.62, height * 0.9));
  }
  if (opening && filledNeck) {
    target = vec(0, neckHeight / 2, 0);
    position = vec(0, neckHeight / 2, 80);
  }
  if (top) {
    target = vec(0, height - 6, 0);
    position = vec(18, height + 5, 65);
    orthographicScale = 19;
  }
  if (topDown) {
    target = vec(0, height / 2, 0);
    position = vec(0, height + width * 2, 0);
    up = vec(0, 0, -1);
    orthographicScale = Math.max(minimumScale, width * 0.62);
  }
  return { position, target, orthographicScale, up };
}

/** The props `updateNSView` watches, as last framed (the Coordinator's fields). */
export interface ReframeState {
  resetCamera: number;
  inspectOpening: boolean;
  inspectTop: boolean;
  topDown: boolean;
  filledNeck: boolean;
}

/** `null` is a Coordinator that has not framed yet (`reset = -1`). */
export function needsReframe(framed: ReframeState | null, next: ReframeState): boolean {
  return (
    framed === null ||
    framed.resetCamera !== next.resetCamera ||
    framed.inspectOpening !== next.inspectOpening ||
    framed.inspectTop !== next.inspectTop ||
    framed.topDown !== next.topDown ||
    (next.inspectOpening && framed.filledNeck !== next.filledNeck)
  );
}
