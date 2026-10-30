import { core } from '#core/parameters';
import { formatFixed } from '../../core/swift/format';
import type { BalloonParameters } from '../../core/types';
import { startExport } from '../../io';
import { useBalloonStore } from '../../stores';
import { Checkbox, Icon, modKeyLabel, ParameterControl, SectionLabel, Switch } from '../../ui';
import { BalloonPreviewColumn } from './BalloonPreviewColumn';
import { PatternEditor } from './PatternEditor';
import './balloon.css';

// The Balloon tab: ContentView's `sidebar` (BalloonStudioApp.swift:380-495) next to its
// `preview` (:496-598).

type NumberField = { [K in keyof BalloonParameters]: BalloonParameters[K] extends number ? K : never }[keyof BalloonParameters];

export function BalloonEditor() {
  return (
    <div className="balloon-tab">
      <div className="balloon-sidebar">
        <div className="balloon-sidebar__scroll">
          <Sections />
        </div>
        <Footer />
      </div>
      <BalloonPreviewColumn />
    </div>
  );
}

/** `parameter(_:key:range:unit:step:)` (:602-604). */
function Parameter({
  title,
  field,
  range,
  unit,
  step = 1,
  help,
}: {
  title: string;
  field: NumberField;
  range: readonly [number, number];
  unit: string;
  step?: number;
  help?: string;
}) {
  const value = useBalloonStore((state) => state.parameters[field]);
  const setField = useBalloonStore((state) => state.setField);
  return <ParameterControl title={title} value={value} range={range} step={step} unit={unit} help={help} onChange={(next) => setField(field, next)} />;
}

/** Swift's synthesized `==` on `BalloonParameters`. */
const sameParameters = (a: BalloonParameters, b: BalloonParameters): boolean => (Object.keys(a) as (keyof BalloonParameters)[]).every((key) => a[key] === b[key]);

/** `preset(_:_:)` (:605-623): lit when the balloon is this shape, whatever its attachments. */
function Preset({ title, shape }: { title: string; shape: BalloonParameters }) {
  const parameters = useBalloonStore((state) => state.parameters);
  const applyShape = useBalloonStore((state) => state.applyShape);
  const matchingShape = core.balloon.normalize({
    ...shape,
    hollow: parameters.hollow,
    wallThickness: parameters.wallThickness,
    stringHoles: parameters.stringHoles,
    cordClearance: parameters.cordClearance,
    hangingLoop: parameters.hangingLoop,
    hangingClearance: parameters.hangingClearance,
    hangingThickness: parameters.hangingThickness,
    hangingWall: parameters.hangingWall,
    hangingFillet: parameters.hangingFillet,
    hangingCrownThickness: parameters.hangingCrownThickness,
  });
  return (
    <button type="button" className="balloon-preset" aria-pressed={sameParameters(parameters, matchingShape)} onClick={() => applyShape(shape)}>
      {title}
    </button>
  );
}

function Sections() {
  const parameters = useBalloonStore((state) => state.parameters);
  const setField = useBalloonStore((state) => state.setField);
  const setPanels = useBalloonStore((state) => state.setPanels);
  const derived = core.balloon.derived(parameters);
  const { hollow, hangingLoop } = parameters;
  const { hasStringHoles } = derived;

  return (
    <>
      <div className="balloon-section balloon-section--tight">
        <SectionLabel>START WITH A SHAPE</SectionLabel>
        <div className="balloon-presets">
          <Preset title="Classic" shape={core.balloon.presets.classic} />
          <Preset title="Round" shape={core.balloon.presets.round} />
          <Preset title="Tall" shape={core.balloon.presets.tall} />
        </div>
      </div>
      <div className="balloon-panel">
        <Switch checked={hollow} testId="hollowMode" onChange={(value) => setField('hollow', value)}>
          <Icon name="lightbulb" size={13} />
          Hollow for LEDs
        </Switch>
        {hollow && (
          <>
            <Parameter
              title="Wall thickness"
              field="wallThickness"
              range={[0.8, 2.4]}
              unit="mm"
              step={0.1}
              help="Nominal shell thickness. A small allowance protects the wall around curves and grooves."
            />
            <p className="balloon-opening">
              <Icon name="circle.dashed" size={12} />
              Opening Ø{formatFixed(derived.openingDiameter, 1)} mm
            </p>
            <p className="balloon-caption">Open underneath for LEDs. Increase the neck diameter for a larger opening.</p>
          </>
        )}
      </div>
      <div className="balloon-section">
        <SectionLabel>DIMENSIONS</SectionLabel>
        <Parameter title="Envelope height" field="height" range={[80, derived.maximumHeight]} unit="mm" />
        <Parameter title="Widest diameter" field="diameter" range={[60, 240]} unit="mm" />
      </div>
      <hr className="balloon-divider" />
      <PatternEditor />
      <hr className="balloon-divider" />
      <div className="balloon-section">
        <SectionLabel>ENVELOPE</SectionLabel>
        <ParameterControl
          title="Vertical panels"
          value={parameters.panels}
          range={[8, 32]}
          step={4}
          help="8 to 32 panels, in groups of four, for a symmetric envelope."
          onChange={setPanels}
        />
        <Parameter
          title="Panel depth"
          field="panelDepth"
          range={[0, 8]}
          unit="%"
          step={0.5}
          help="Depth of the grooves as a percentage of the radius. Zero makes a smooth envelope."
        />
        <Parameter title="Shoulder height" field="shoulder" range={[50, 75]} unit="%" help="Where the balloon reaches its widest point, measured from the bottom." />
      </div>
      <hr className="balloon-divider" />
      <div className="balloon-section">
        <SectionLabel>{hollow || hasStringHoles ? 'NECK' : 'FLAT BASE'}</SectionLabel>
        <Parameter title="Neck diameter" field="neckDiameter" range={[derived.minimumNeckDiameter, derived.maximumNeckDiameter]} unit="mm" />
        <Parameter title="Neck height" field="neckHeight" range={[derived.minimumNeckHeight, derived.maximumNeckHeight]} unit="mm" />
      </div>
      <hr className="balloon-divider" />
      <div className="balloon-section">
        <SectionLabel>ATTACHMENTS</SectionLabel>
        <Checkbox className="balloon-toggle" checked={parameters.stringHoles} testId="basketAttachments" onChange={(value) => setField('stringHoles', value)}>
          Basket string holes
        </Checkbox>
        {hasStringHoles && (
          <>
            <Parameter title="Basket cord clearance" field="cordClearance" range={[2, 5]} unit="mm" step={0.5} />
            <p className="balloon-caption">
              {hollow
                ? 'Four holes in a reinforced neck, at least 12 mm tall. The LED opening stays clear.'
                : 'Two straight, crossing through-holes connect opposite sides of the neck. The bottom stays closed and flat.'}
            </p>
          </>
        )}
        <Checkbox className="balloon-toggle" checked={hangingLoop} testId="ceilingAttachment" onChange={(value) => setField('hangingLoop', value)}>
          Ceiling hanging loop
        </Checkbox>
        {hangingLoop && (
          <>
            <Parameter title="Hanging cord clearance" field="hangingClearance" range={[2, 5]} unit="mm" step={0.5} />
            <Parameter
              title="Eyelet thickness"
              field="hangingThickness"
              range={[8, 16]}
              unit="mm"
              step={0.5}
              help="Thickness from front to back along the cord hole. More material strengthens the eyelet."
            />
            <Parameter
              title="Material around hole"
              field="hangingWall"
              range={[4, 8]}
              unit="mm"
              step={0.5}
              help="Material beside and above the cord hole. Increasing this makes the eyelet wider and taller."
            />
            <Parameter
              title="Base flare radius"
              field="hangingFillet"
              range={[2.5, 5]}
              unit="mm"
              step={0.5}
              help="Rounds and widens the join into the balloon. A larger flare also raises the hole to keep it clear."
            />
            {hollow && (
              <Parameter
                title="Crown thickness"
                field="hangingCrownThickness"
                range={[3.4, 8]}
                unit="mm"
                step={0.2}
                help="Nominal thickness under the hanger, blended into the hollow shell. A thicker crown lets less light through."
              />
            )}
            <p className="balloon-caption">
              Rounded eyelet on a reinforced crown. Hanger height: {formatFixed(derived.loopHeight, 1)} mm. Total print height: {formatFixed(derived.totalHeight, 1)} mm. Envelope
              height is limited automatically to fit the P2S.
            </p>
            <p className="balloon-caption">
              Print the eyelet and its crown base solid with a local 100% infill modifier. Strength depends on the printed layers; test the finished attachment before hanging.
            </p>
          </>
        )}
      </div>
      <p className="balloon-note">
        {hollow
          ? 'A real shell with a closed crown and open neck. Thin, translucent filament lets the LEDs glow through.'
          : 'Closed envelope, no basket. Choose wall thickness and infill in your slicer.'}
      </p>
    </>
  );
}

/** The export footer (:470-493); the web's saved line is plan §6, "Show in Finder". */
function Footer() {
  const exporting = useBalloonStore((state) => state.exporting);
  const exported = useBalloonStore((state) => state.exported);
  const format = useBalloonStore((state) => state.exportFormat());
  return (
    <div className="balloon-footer">
      <button type="button" className="balloon-export" disabled={exporting} data-testid="exportBalloon" onClick={() => void startExport('balloon')}>
        {exporting ? <span className="balloon-spinner" aria-hidden="true" /> : <Icon name="square.and.arrow.up" size={14} />}
        <span>{exporting ? `Preparing ${format}…` : `Export ${format}…`}</span>
        <span className="balloon-export__shortcut">{modKeyLabel()}E</span>
      </button>
      <div aria-live="polite">
        {exported !== null ? (
          <p className="balloon-saved">
            <Icon name="checkmark.circle.fill" size={12} />
            File {exported.mode} · {exported.filename}
          </p>
        ) : (
          <p className="balloon-caption">{format} · millimetres · checked before export</p>
        )}
      </div>
    </div>
  );
}
