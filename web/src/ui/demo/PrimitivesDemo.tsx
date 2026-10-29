import { useState } from 'react';
import { AdviceRow } from '../AdviceRow';
import { AlertDialog } from '../AlertDialog';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { ColorPicker } from '../ColorPicker';
import { DisclosureGroup } from '../DisclosureGroup';
import type { FilamentColorName } from '../filamentColors';
import { BALLOON_TEXT_FONTS, balloonTextFontStyle, type BalloonTextFontName } from '../fonts';
import { formatNumber } from '../format';
import { BalloonMark, Icon, SYMBOL_NAMES } from '../Icon';
import { Metric, MetricRow } from '../Metric';
import { ParameterControl } from '../ParameterControl';
import { altKeyLabel, modKeyLabel } from '../platform';
import { SectionLabel } from '../SectionLabel';
import { SegmentedControl } from '../SegmentedControl';
import { Select } from '../Select';
import { Sheet } from '../Sheet';
import { Switch } from '../Switch';
import './demo.css';

// Every primitive on one page, with strings and ranges from the Mac editors. Not part of
// the app: a visual reference for WP-U5..U8 and a smoke test (primitives.test.tsx).

const parts = ['Balloon', 'Basket', 'Ring', 'Cloud', 'Sun', 'Figures', 'Cable clip'] as const;
const patterns = [
  'Solid',
  'Horizontal stripes',
  'Hearts',
  'Polka dots',
  'Diamonds',
  'Text',
  'Night Flight',
  'Summit Cable Car',
];
const layerHeights = [0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32];
// RingEditor.swift:371-372
const guide = [
  [
    '1 · Print and dry-fit',
    'Print 3 cord-guide sections A, 3 plain sections B, 6 underside plates C and 12 pins D. Print a plate and pin first to check the joint fit. All exports are already oriented flat on the bed; print pins upright. Start with 0.2 mm layers, 6 walls and 40% infill for A/B, solid plates and pins. These are prototype settings, not a load rating.',
  ],
  [
    '2 · Glue a complete circle',
    'Alternate A–B–A–B–A–B with the channels up. Put a curved plate underneath each seam and align with two pins. Use a PLA-compatible adhesive on the broad plate surfaces, seam faces and pins, following its preparation and full-cure instructions. Keep the three large guides and channel free of glue. Pins align the parts; they do not lock the joint.',
  ],
] as const;

export function PrimitivesDemo() {
  const [part, setPart] = useState<(typeof parts)[number]>('Balloon');
  const [hollow, setHollow] = useState(true);
  const [wall, setWall] = useState(1.2);
  const [height, setHeight] = useState(220);
  const [diameter, setDiameter] = useState(180);
  const [panels, setPanels] = useState(12);
  const [depth, setDepth] = useState(3.5);
  const [pattern, setPattern] = useState('Text');
  const [font, setFont] = useState<BalloonTextFontName>('Rounded');
  const [base, setBase] = useState<FilamentColorName>('Saffron');
  const [detail, setDetail] = useState<FilamentColorName>('Cream');
  const [layer, setLayer] = useState(0.2);
  const [flush, setFlush] = useState(400);
  const [multiplier, setMultiplier] = useState(1);
  const [density, setDensity] = useState(1.24);
  const [cutaway, setCutaway] = useState(false);
  const [plate, setPlate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [alert, setAlert] = useState(false);
  const [sheet, setSheet] = useState(false);

  return (
    <div className="ui-demo">
      <header className="ui-demo__header">
        <span className="ui-demo__mark">
          <BalloonMark size={24} />
        </span>
        <div>
          <h1 className="ui-demo__title">Balloon Studio</h1>
          <p className="ui-demo__subtitle">A little shape. A lot of possibility.</p>
        </div>
        <SegmentedControl
          label="Part"
          options={parts.map((value) => ({ value, label: value }))}
          value={part}
          onChange={setPart}
          className="ui-demo__parts"
        />
        <Button>
          <Icon name="folder" />
          Open…
        </Button>
        <span className="ui-demo__pill">
          <Icon name="printer" size={12} />
          Made for your P2S
        </span>
      </header>

      <main className="ui-demo__columns">
        <section className="ui-demo__sidebar" aria-label="Controls">
          <div className="ui-demo__panel">
            <Switch checked={hollow} onChange={setHollow} testId="hollowMode">
              <Icon name="lightbulb" />
              Hollow for LEDs
            </Switch>
            {hollow && (
              <ParameterControl
                title="Wall thickness"
                value={wall}
                onChange={setWall}
                range={[0.8, 2.4]}
                step={0.1}
                unit="mm"
                help="Nominal shell thickness. A small allowance protects the wall around curves and grooves."
              />
            )}
          </div>
          <div className="ui-demo__stack">
            <SectionLabel>DIMENSIONS</SectionLabel>
            <ParameterControl title="Envelope height" value={height} onChange={setHeight} range={[80, 300]} unit="mm" />
            <ParameterControl
              title="Widest diameter"
              value={diameter}
              onChange={setDiameter}
              range={[60, 240]}
              unit="mm"
            />
          </div>
          <hr className="ui-demo__divider" />
          <div className="ui-demo__stack">
            <SectionLabel>PATTERN &amp; COLOR</SectionLabel>
            <Select
              label="Pattern"
              options={patterns.map((value) => ({ value, label: value }))}
              value={pattern}
              onChange={setPattern}
              testId="patternStyle"
            />
            <Select
              label="Font"
              rich
              options={BALLOON_TEXT_FONTS.map((value) => ({ value, label: value, style: balloonTextFontStyle(value) }))}
              value={font}
              onChange={setFont}
              testId="balloonTextFont"
            />
            <ColorPicker label="Base · filament 1" value={base} onChange={setBase} />
            <ColorPicker label="Pattern · filament 2" value={detail} onChange={setDetail} />
            <DisclosureGroup title="P2S waste assumptions">
              <Select
                label="Layer height"
                options={layerHeights.map((value) => ({ value, label: `${value.toFixed(2)} mm` }))}
                value={layer}
                onChange={setLayer}
              />
              <ParameterControl
                title="Base → pattern"
                value={flush}
                onChange={setFlush}
                range={[0, 1500]}
                step={10}
                unit="mm³"
              />
              <ParameterControl
                title="Flush multiplier"
                value={multiplier}
                onChange={setMultiplier}
                range={[0, 2]}
                step={0.1}
                unit="×"
              />
              <ParameterControl
                title="Density (g/cm³)"
                value={density}
                onChange={setDensity}
                range={[0.5, 2]}
                step={0.01}
              />
            </DisclosureGroup>
          </div>
          <hr className="ui-demo__divider" />
          <div className="ui-demo__stack">
            <SectionLabel>ENVELOPE</SectionLabel>
            <ParameterControl
              title="Vertical panels"
              value={panels}
              onChange={setPanels}
              range={[8, 32]}
              step={4}
              help="8 to 32 panels, in groups of four, for a symmetric envelope."
            />
            <ParameterControl
              title="Panel depth"
              value={depth}
              onChange={setDepth}
              range={[0, 8]}
              step={0.5}
              unit="%"
              help="Depth of the grooves as a percentage of the radius. Zero makes a smooth envelope."
            />
            <ParameterControl title="Text height" value={3} onChange={() => {}} range={[3, 3]} unit="mm" />
          </div>
        </section>

        <section className="ui-demo__preview" aria-label="Preview">
          <div className="ui-demo__stage">
            <span className="ui-demo__badge">
              <Icon name="checkmark.circle.fill" className="ui-demo__fit" />
              Fits P2S <span className="ui-demo__dim">256³ mm</span>
            </span>
            <BalloonMark size={140} className="ui-demo__balloon" />
            <span className="ui-demo__hint">Drag to orbit · Scroll to zoom</span>
          </div>
          <div className="ui-demo__toggles">
            <Checkbox
              checked={cutaway}
              onChange={setCutaway}
              help="Preview the cavity. The exported file always contains the complete shell."
            >
              Cutaway
            </Checkbox>
            <Checkbox checked={plate} onChange={setPlate}>
              Build plate
            </Checkbox>
            <Checkbox checked={wireframe} onChange={setWireframe}>
              Wireframe
            </Checkbox>
          </div>
          <MetricRow>
            <Metric title="DIAMETER" value={String(diameter)} unit="mm" />
            <Metric title="TOTAL HEIGHT" value={formatNumber(height, 1)} unit="mm" />
            <Metric title="PANELS" value={String(panels)} />
          </MetricRow>
          <AdviceRow icon="exclamationmark.triangle" tone="accent" title="Shell printing · 0% infill">
            Use standard mode, not vase mode. Print neck down with a brim. The hollow crown may need supports; inspect
            your sliced layers.
          </AdviceRow>
          <AdviceRow icon="exclamationmark.triangle" tone="warning" title="Check supports in your slicer">
            Outward overhang reaches 52° from vertical. Inspect the sliced layers before printing.
          </AdviceRow>
          <div className="ui-demo__buttons">
            <Button variant="prominent" onClick={() => setAlert(true)}>
              <Icon name="square.and.arrow.up" />
              Export STL… <kbd>{modKeyLabel()}E</kbd>
            </Button>
            <Button onClick={() => setSheet(true)}>Show sheet</Button>
            <Button>
              <Icon name="arrow.counterclockwise" />
              Reset part <kbd>{altKeyLabel()}N</kbd>
            </Button>
          </div>
          <div className="ui-demo__icons" aria-label="Icons">
            {SYMBOL_NAMES.map((name) => (
              <span key={name} className="ui-demo__icon" title={name}>
                <Icon name={name} size={16} />
              </span>
            ))}
          </div>
        </section>
      </main>

      <AlertDialog
        open={alert}
        title="Export failed"
        message="The model could not be exported: the surface is not consistently closed"
        onDismiss={() => setAlert(false)}
      />
      <Sheet open={sheet} title="Six-section ring · assembly" onDone={() => setSheet(false)} width={640} height={620}>
        {guide.map(([title, body]) => (
          <section key={title} className="ui-demo__guide">
            <h3>{title}</h3>
            <p>{body}</p>
          </section>
        ))}
      </Sheet>
    </div>
  );
}
