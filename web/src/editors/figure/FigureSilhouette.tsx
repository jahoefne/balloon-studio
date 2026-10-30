// `FigureSilhouette` (FigureEditor.swift:266-283): the figure's drawing, windows included, fitted
// into a square. Filled even-odd, so the balloon's window and the like stay open.

import { core } from '#core/parameters';
import type { FigureOutlineInfo } from '../../core/api';
import type { FigureStyle } from '../../core/types';

/** `path(in:)` for a rectangle of `size` × `size` with its origin at the top left. */
export function silhouettePath(outline: FigureOutlineInfo, size: number): string {
  const scale = Math.min(size / (outline.maxX - outline.minX), size / (outline.maxY - outline.minY));
  const cx = (outline.minX + outline.maxX) / 2;
  const cy = (outline.minY + outline.maxY) / 2;
  const number = (v: number) => (size / 2 + v * scale).toFixed(3);
  return outline.loops
    .map((loop) => `M${loop.map((p) => `${number(p.x - cx)} ${number(-(p.y - cy))}`).join('L')}Z`)
    .join('');
}

const SIZE = 28;
const paths = new Map<FigureStyle, string>();

const pathFor = (style: FigureStyle): string => {
  let path = paths.get(style);
  if (path === undefined) {
    path = silhouettePath(core.figure.outline(style), SIZE);
    paths.set(style, path);
  }
  return path;
};

export function FigureSilhouette({ style, className }: { style: FigureStyle; className?: string | undefined }) {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} aria-hidden data-testid={`figureSilhouette-${style}`}>
      <path d={pathFor(style)} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
