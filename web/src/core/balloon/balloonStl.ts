// Ported from mac/Sources/BalloonStudio/STLImport.swift @ cbda68d (lines 21-46: BalloonSTL limits,
// signatures and export). The reading half (lines 48-238) is in stlImport.ts.
//
// Standard STL geometry, with optional settings stored in its 80-byte binary header.
// A digest binds the settings to the geometry so edits in other software invalidate them.
import type { BalloonMesh } from '../geometry/mesh';
import { binarySTL } from '../io/binaryStl';
import { sha256 } from '../io/sha256';
import type { BalloonParameters } from '../types';
import { normalized } from './balloonParameters';

export const maximumBytes = 150_000_000;
export const maximumTriangles = 2_000_000;
export const legacySignature = 'BSTL0001';
export const signature = 'BSTL0002';

/** Swift `BalloonSTL.export(_:parameters:)`; `export` itself is a reserved word here. */
export function exportSTL(mesh: BalloonMesh, parameters: BalloonParameters): Uint8Array {
  const data = binarySTL(mesh);
  const p = normalized(parameters);
  const header = new Uint8Array(80);
  for (let i = 0; i < signature.length; i++) header[i] = signature.charCodeAt(i);
  header[8] = (p.hollow ? 1 : 0) | (p.stringHoles ? 2 : 0) | (p.hangingLoop ? 4 : 0);
  header[9] = p.panels;
  const view = new DataView(header.buffer);
  let at = 10;
  for (const value of [p.height, p.diameter, p.panelDepth, p.neckDiameter, p.neckHeight, p.shoulder, p.wallThickness, p.cordClearance, p.hangingClearance,
    p.hangingThickness, p.hangingWall, p.hangingFillet, p.hangingCrownThickness]) {
    view.setFloat32(at, value, true);
    at += 4;
  }
  // Version 2 retains a 128-bit integrity digest to fit the additional
  // hanger settings inside the standard 80-byte binary STL header.
  header.set(sha256(header.subarray(0, 62), data.subarray(80)).subarray(0, 16), 62);
  // The last two bytes stay zero.
  data.set(header, 0);
  return data;
}
