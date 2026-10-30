// SeparateCordDiagram and ContinuousCordDiagram (RingEditor.swift:412-455), both `.frame(width:106,height:100)`.

const W = 106;
const H = 100;

function Balloon({ x }: { x: number }) {
  // Path(ellipseIn:CGRect(x:x-7,y:h-18,width:14,height:16))
  return <ellipse cx={x} cy={H - 10} rx={7} ry={8} fill="var(--accent)" fillOpacity={0.25} />;
}

/** The hook above the ring: Path(ellipseIn:CGRect(x:cx-4,y:2,width:8,height:8)) */
function CeilingHook() {
  return <circle cx={W / 2} cy={6} r={4} fill="none" stroke="var(--ink)" strokeWidth={1.5} />;
}

export function SeparateCordDiagram() {
  const cx = W / 2;
  const cy = H * 0.46;
  const rx = W * 0.38;
  const ry = H * 0.12;
  const point = (hole: number) => {
    const angle = (hole * Math.PI) / 3 - Math.PI / 2;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  };
  const holes = [0, 1, 2, 3, 4, 5];
  return (
    <svg
      className="ring-cords"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Six attachment holes alternate around the ring: three ceiling suspension cords meet above it, and three separate balloon cords hang from the holes in between."
      data-testid="separateCordDiagram"
    >
      {[0, 2, 4].map((hole) => {
        const p = point(hole);
        return <line key={hole} x1={cx} y1={8} x2={p.x} y2={p.y} stroke="var(--accent)" strokeWidth={1.5} />;
      })}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="var(--ink)" strokeOpacity={0.2} strokeWidth={7} />
      {holes.map((hole) => {
        const p = point(hole);
        return (
          <g key={hole}>
            <circle cx={p.x} cy={p.y} r={2} fill="var(--accent)" />
            {hole % 2 === 1 && (
              <>
                <line x1={p.x} y1={p.y} x2={p.x} y2={H - 17} stroke="var(--accent)" strokeWidth={1.5} />
                <Balloon x={p.x} />
              </>
            )}
          </g>
        );
      })}
      <CeilingHook />
    </svg>
  );
}

export function ContinuousCordDiagram() {
  const ringY = H * 0.49;
  return (
    <svg
      className="ring-cords"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Suspension schematic: three continuous cords from the ceiling through ring guides to the balloons. Retainers below the guides support the ring."
      data-testid="continuousCordDiagram"
    >
      <line x1={8} y1={ringY} x2={W - 8} y2={ringY} stroke="var(--ink)" strokeOpacity={0.2} strokeWidth={9} />
      {[0.18, 0.5, 0.82].map((fraction) => {
        const x = W * fraction;
        return (
          <g key={fraction}>
            <polyline points={`${W / 2},8 ${x},${ringY} ${x},${H - 16}`} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
            {/* Path(ellipseIn:CGRect(x:x-3,y:h*0.49+5,width:6,height:4)) */}
            <ellipse cx={x} cy={ringY + 7} rx={3} ry={2} fill="var(--accent)" />
            <Balloon x={x} />
          </g>
        );
      })}
      <CeilingHook />
    </svg>
  );
}
