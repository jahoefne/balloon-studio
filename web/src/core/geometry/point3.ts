// Ported from mac/Sources/BalloonStudio/BalloonGeometry.swift @ cbda68d (lines 99-116: Point3, Triangle).
//
// Swift's operators become free functions with the same evaluation order:
//   a - b → sub(a, b), a + b → add(a, b), a * s → scale(a, s), a.cross(b) → cross(a, b),
//   a.dot(b) → dot(a, b), a.length → length(a), a.unit → unit(a).
// Point3 is a Swift struct (value type): never mutate a Point3 that another array may share.
import { swiftMax } from '../swift/minmax';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface Triangle {
  a: number;
  b: number;
  c: number;
}

export function point3(x: number, y: number, z: number): Point3 {
  return { x, y, z };
}

export function triangle(a: number, b: number, c: number): Triangle {
  return { a, b, c };
}

/** Swift `Point3.zero`. Returns a fresh value each time. */
export function zero(): Point3 {
  return { x: 0, y: 0, z: 0 };
}

export function sub(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function add(a: Point3, b: Point3): Point3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Swift `a * b` with a Double `b`. */
export function scale(a: Point3, b: number): Point3 {
  return { x: a.x * b, y: a.y * b, z: a.z * b };
}

export function cross(a: Point3, b: Point3): Point3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function length(a: Point3): number {
  return Math.sqrt(dot(a, a));
}

/** Swift `a.unit`: divides by `max(length, 1e-30)`. */
export function unit(a: Point3): Point3 {
  const d = swiftMax(length(a), 1e-30);
  return { x: a.x / d, y: a.y / d, z: a.z / d };
}
