// Ported from mac/Sources/BalloonStudio/CloudLEDLayout.swift @ cbda68d.
//
// WP-K4a part 1 freezes the shape of the plan. Its constructor, `cutList` and `svg`
// (:18-116) follow in part 2.

import type { CloudParameters } from '../types';
import { Rect } from './cloudGeometry';

export class Section {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly length: number,
  ) {}
  footprint(width: number): Rect {
    return new Rect(this.x - this.length / 2, this.x + this.length / 2, this.y - width / 2, this.y + width / 2);
  }
}

/**
 * A mounting plan on the existing floor, independent of the mesher's small
 * rectangular core. Hardware sizes, row spacing and cut pitch stay in mm.
 */
export class CloudLEDPlan {
  readonly parameters: CloudParameters;
  readonly sections: readonly Section[];

  constructor(input: CloudParameters) {
    this.parameters = input;
    this.sections = [];
    throw new Error('WP-K4a part 2');
  }
  get totalLength(): number {
    return this.sections.reduce((sum, section) => sum + section.length, 0);
  }
  get nominalWatts(): number {
    return this.totalLength * 0.009;
  }
  get rowCount(): number {
    return new Set(this.sections.map((section) => section.y)).size;
  }
  get cutList(): string {
    throw new Error('WP-K4a part 2');
  }
  get svg(): string {
    throw new Error('WP-K4a part 2');
  }
}
