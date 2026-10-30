// LEDReflectorDiagram.swift: an actual radial cross section, with the LED envelope shown schematically.

import { core } from '#core/parameters';
import type { RingParameters } from '../../core/types';

// What `.frame(height:155)` leaves the Canvas in the 244 pt wide LED panel, once the caption, the
// legend and the two 5 pt gaps of the VStack are off.
const WIDTH = 244;
const HEIGHT = 123;

export function LEDReflectorDiagram({ parameters: p }: { parameters: RingParameters }) {
  const d = core.ring.derived(p);
  const scale = Math.min((WIDTH - 16) / p.bandWidth, (HEIGHT - 28) / d.totalHeight);
  const left = (WIDTH - p.bandWidth * scale) / 2;
  const bottom = HEIGHT - 8;
  const x = (r: number) => left + (r - d.innerRadius) * scale;
  const y = (z: number) => bottom - z * scale;
  const at = (r: number, z: number) => `${x(r)} ${y(z)}`;

  const body = [
    `M${at(d.innerRadius, 0)}`,
    ...d.outerProfile.map((v) => `L${at(v.radius, v.z)}`),
    `L${at(d.innerRadius, p.height)}`,
    'Z',
  ].join(' ');
  const middle = d.ledShelfZ + p.stripWidth / 2;
  const ramp = d.reflectorToeRadius - (middle - p.height);
  const tipX = x(ramp + 3);
  const tipY = y(d.totalHeight + 3);

  return (
    <div
      className="ring-reflector"
      role="img"
      aria-label="Radial cross section: the strip stands vertically against the outer wall on a ledge. It faces a 45 degree white reflector with an inner shielding lip. Light escapes through the open top; the solid floor blocks direct sight from below. The arrow is schematic, not an optical simulation."
    >
      <p className="ring-reflector__caption">UPWARD LIGHT · CROSS SECTION</p>
      <svg className="ring-reflector__canvas" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} data-testid="ledReflectorDiagram">
        <path d={body} fill="white" stroke="var(--ink)" strokeOpacity={0.4} strokeWidth={1} />
        <rect
          x={x(d.ledWallRadius - p.stripThickness)}
          y={y(d.ledShelfZ + p.stripWidth)}
          width={p.stripThickness * scale}
          height={p.stripWidth * scale}
          fill="var(--accent)"
        />
        <path
          d={`M${at(d.ledWallRadius - p.stripThickness - 0.4, middle)} L${at(ramp + 0.2, middle)} L${at(ramp + 3, d.totalHeight + 3)}`}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeDasharray="3 2"
        />
        <path d={`M${tipX - 4} ${tipY + 5} L${tipX} ${tipY} L${tipX + 4} ${tipY + 5}`} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      </svg>
      <div className="ring-reflector__legend">
        <span>Ring centre</span>
        <span>Outer wall · LED</span>
      </div>
    </div>
  );
}
