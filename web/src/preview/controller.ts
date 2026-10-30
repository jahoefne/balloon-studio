// `updateNSView` of BalloonPreview.swift:203-228: compares the props with what the scene shows
// and does only the work that changed. Separate from React and WebGL so its rules are testable.

import { Color } from 'three';
import type { MeshBuffers } from '../core/types';
import type { PreviewColor } from './colors';
import { buildDisplayGeometry, type DisplayGeometry } from './displayGeometry';
import { frame, needsReframe, type Framing, type ReframeState } from './framing';
import { toColor, type StageScene } from './scene';

export interface StageProps {
  /** `null` until the first preview arrives; the previous mesh stays up while a new one is on its way. */
  mesh: MeshBuffers | null;
  /** Replaces Swift's numeric revision mix: `${revision}:${viewKey}`. A new key rebuilds the geometry. */
  geometryKey: string;
  color: PreviewColor;
  showPlate: boolean;
  wireframe: boolean;
  /** Any change frames the camera again. */
  resetCamera: number;
  cutaway: boolean;
  inspectOpening: boolean;
  neckDiameter: number;
  neckHeight?: number | undefined;
  filledNeck?: boolean | undefined;
  compactObject?: boolean | undefined;
  inspectTop?: boolean | undefined;
  /** Default: all faces body color, so pass `mesh.faceColors` where Swift passes colors. */
  faceColors?: ArrayLike<number> | undefined;
  detailColor?: PreviewColor | undefined;
  accentColor?: PreviewColor | undefined;
  hardwareColor?: PreviewColor | undefined;
  minimumScale?: number | undefined;
  topDown?: boolean | undefined;
  objectName?: string | null | undefined;
  sharpEdges?: boolean | undefined;
  /** Radians. */
  smoothAngle?: number | undefined;
  smoothBelowHeight?: number | null | undefined;
}

/** The label of BalloonPreview.swift:200. */
export const stageLabel = (props: Pick<StageProps, 'objectName' | 'compactObject'>): string =>
  `Interactive ${props.objectName ?? (props.compactObject ? 'basket' : 'balloon')} preview. Drag to rotate, scroll to zoom.`;

export interface StageTarget {
  requestRender(): void;
  applyFraming(framing: Framing): void;
}

const scratch = new Color();

export function createStageController(stage: StageScene, target: StageTarget) {
  let display: DisplayGeometry | null = null;
  let geometryKey: string | null = null;
  let cutaway = false;
  let framed: ReframeState | null = null;

  return {
    update(props: StageProps): void {
      let dirty = false;
      const { mesh } = props;

      if (mesh && (geometryKey !== props.geometryKey || cutaway !== props.cutaway)) {
        display = buildDisplayGeometry(
          mesh,
          {
            cutaway: props.cutaway,
            faceColors: props.faceColors,
            sharpEdges: props.sharpEdges ?? false,
            smoothAngle: props.smoothAngle ?? 0,
            smoothBelowHeight: props.smoothBelowHeight,
          },
          display,
        );
        stage.setDisplayGeometry(display);
        geometryKey = props.geometryKey;
        cutaway = props.cutaway;
        dirty = true;
      }

      const colors: PreviewColor[] = [
        props.color,
        props.detailColor ?? [1, 1, 1],
        props.accentColor ?? [0, 0, 0],
        props.hardwareColor ?? [0.5, 0.5, 0.5], // NSColor.gray
      ];
      stage.materials.forEach((material, i) => {
        toColor(colors[i]!, scratch);
        if (material.color.equals(scratch)) return;
        material.color.copy(scratch);
        dirty = true;
      });
      for (const material of stage.materials) {
        if (material.wireframe === props.wireframe) continue;
        material.wireframe = props.wireframe;
        dirty = true;
      }
      if (stage.plate.visible !== props.showPlate) {
        stage.plate.visible = props.showPlate;
        dirty = true;
      }

      const next: ReframeState = {
        resetCamera: props.resetCamera,
        inspectOpening: props.inspectOpening,
        inspectTop: props.inspectTop ?? false,
        topDown: props.topDown ?? false,
        filledNeck: props.filledNeck ?? false,
      };
      // Without a mesh there is nothing to measure; the first mesh frames.
      if (mesh && needsReframe(framed, next)) {
        const { dimensions } = mesh;
        target.applyFraming(
          frame({
            height: dimensions.z,
            neck: props.neckDiameter,
            opening: props.inspectOpening,
            compact: props.compactObject ?? false,
            width: Math.max(dimensions.x, dimensions.y),
            top: next.inspectTop,
            neckHeight: props.neckHeight ?? 12,
            filledNeck: next.filledNeck,
            topDown: next.topDown,
            minimumScale: props.minimumScale ?? 32,
          }),
        );
        framed = next;
        dirty = true;
      }

      if (dirty) target.requestRender();
    },
  };
}
