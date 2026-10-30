// RingEditor.swift:126-410. As in Swift the sidebar follows `parameters`, the preview column what
// was last built (`bundle.parameters`), so a slider never shows numbers ahead of the mesh.

import { useEffect, useState } from 'react';
import { core } from '#core/parameters';
import type { RingParameters } from '../../core/types';
import { calibrated, Stage } from '../../preview';
import { useBalloonStore, useRingStore } from '../../stores';
import {
  AlertDialog,
  Button,
  Checkbox,
  commitEditing,
  Icon,
  Metric,
  MetricRow,
  number01,
  ParameterControl,
  roundHalfAwayFromZero,
  SectionLabel,
  SegmentedControl,
  Select,
} from '../../ui';
import { ExportFooter, PartEditor, PreviewStatus, StageFrame, StageResetButton, useOnChange } from '../shared/PartEditor';
import { ContinuousCordDiagram, SeparateCordDiagram } from './CordDiagrams';
import { LEDReflectorDiagram } from './LEDReflectorDiagram';
import { RingGuideSheet } from './RingGuideSheet';
import './ring.css';

type NumericKey = Exclude<keyof RingParameters, 'segmented' | 'reflectedLED'>;

/** `RingView` (RingEditor.swift:5-17); the raw value minus one indexes `bundle.parts`. */
const ASSEMBLY = 0;
const PLATE = 3;
const PIN = 4;
const RING_VIEWS = [
  { value: ASSEMBLY, label: 'Assembled ring' },
  { value: 1, label: 'A · Cord guide · print 3' },
  { value: 2, label: 'B · Plain section · print 3' },
  { value: PLATE, label: 'C · Joint plate · print 6' },
  { value: PIN, label: 'D · Alignment pin · print 12' },
];

const FLAT_COLOR = calibrated(0.73, 0.77, 0.7);
const DETAIL_COLOR = calibrated(0.35, 0.53, 0.46);

export function RingEditor() {
  const model = useRingStore();
  const [showPlate, setShowPlate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [topDown, setTopDown] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [resetCamera, setResetCamera] = useState(0);
  const [selection, setSelection] = useState(ASSEMBLY);
  const [showInstructions, setShowInstructions] = useState(false);
  const bumpCamera = () => setResetCamera((n) => n + 1);

  // The Mac model builds its first mesh in `init`; here a tab shown first needs a nudge. No-op otherwise.
  useEffect(() => useRingStore.getState().ensurePreview(), []);

  const { parameters, bundle } = model;

  // RingEditor.swift:143-146
  useOnChange(selection, () => {
    bumpCamera();
    setTopDown(false);
  });
  useOnChange(exploded, bumpCamera);
  useOnChange(bundle?.parameters.diameter, (previous) => {
    if (previous !== undefined) bumpCamera();
  });
  useOnChange(parameters.segmented, () => {
    setSelection(ASSEMBLY);
    setExploded(false);
    bumpCamera();
  });

  const derived = core.ring.derived(parameters);

  const parameter = (title: string, key: NumericKey, range: readonly [number, number], step = 1) => (
    <ParameterControl title={title} value={parameters[key]} onChange={(value) => model.setField(key, value)} range={range} step={step} unit="mm" />
  );

  const sidebar = (
    <>
      <div className="part-stack part-stack--8">
        <SectionLabel>A MOBILE FOR THREE</SectionLabel>
        <SegmentedControl
          label="Construction"
          testId="ringConstruction"
          hug
          options={[
            { value: 'one', label: 'One piece' },
            { value: 'six', label: 'Six sections' },
          ]}
          value={parameters.segmented ? 'six' : 'one'}
          onChange={(value) => model.construction(value === 'six')}
        />
        <p className="ring-headline">{parameters.segmented ? 'A bigger ring, printed in parts.' : 'One ring. Three balloons.'}</p>
        <p className="part-text">
          {parameters.segmented
            ? 'Three cord-guide sections alternate with three plain sections. Glue the curved plates underneath and align with printed pins.'
            : parameters.reflectedLED
              ? 'One continuous ring with three ceiling holes, three balloon holes and a raised reflector for an upright LED strip.'
              : 'Three balloon ties, evenly spaced around a flat ring. Three more holes suspend it from a single ceiling string.'}
        </p>
      </div>
      <div className="part-stack">
        <SectionLabel>RING DIMENSIONS</SectionLabel>
        {parameter('Ring diameter', 'diameter', [derived.diameterRange.lower, derived.diameterRange.upper])}
        {parameter('Band width', 'bandWidth', [derived.minimumBandWidth, derived.maximumBandWidth])}
        {parameter(parameters.reflectedLED ? 'Base thickness' : 'Ring thickness', 'height', [derived.heightRange.lower, derived.heightRange.upper], 0.5)}
        {parameters.reflectedLED && (
          <p className="part-caption">
            With the raised light trough: {number01(derived.totalHeight)} mm tall{parameters.segmented ? ', plus 4 mm at the joint plates.' : '.'}
          </p>
        )}
        {parameters.segmented ? (
          <p className="part-caption">The assembled ring is larger than the bed. Each section is rotated and centred for printing.</p>
        ) : (
          !derived.fitsP2S && (
            <>
              <p className="part-caption">Full-size model · exceeds the P2S bed. Set the diameter to 240 mm for a test print while keeping the LED mount full size.</p>
              <Button className="part-accent-button" onClick={() => model.setField('diameter', 240)}>
                Use 240 mm for a test print
              </Button>
            </>
          )
        )}
        {!parameters.segmented && (
          <Button className="part-accent-button" testId="ringAssemblyGuide" onClick={() => setShowInstructions(true)}>
            Printing &amp; lighting guide
          </Button>
        )}
      </div>
      {parameters.segmented && (
        <div className="part-stack part-stack--12">
          <SectionLabel>PERMANENT JOINTS</SectionLabel>
          {parameter('Joint fit allowance', 'jointFit', [0.2, 0.6], 0.1)}
          <p className="part-text">Six 4 mm-thick plates bridge the seams, with about 30 mm overlap on each side. Twelve bevelled pins align the glue-up.</p>
          <Button className="part-accent-button" testId="ringAssemblyGuide" onClick={() => setShowInstructions(true)}>
            Printing &amp; assembly guide
          </Button>
        </div>
      )}
      <div className="part-stack ring-led-panel">
        <p className="ring-led-panel__title">
          <Icon name="lightbulb" size={12} />
          LED mounting
        </p>
        <Select
          label="Light mount"
          testId="ringLightMount"
          hug
          options={[
            { value: 'reflected', label: 'Reflected uplight' },
            { value: 'flat', label: 'Flat top channel' },
          ]}
          value={parameters.reflectedLED ? 'reflected' : 'flat'}
          onChange={(value) => model.lighting(value === 'reflected')}
        />
        {parameter('LED strip width', 'stripWidth', [3.5, 12], 0.5)}
        {parameter('LED fit allowance', 'ledClearance', [0.2, 1], 0.1)}
        {parameters.reflectedLED ? (
          <>
            {parameter('Strip thickness incl. LEDs', 'stripThickness', [1, 6], 0.5)}
            <LEDReflectorDiagram parameters={parameters} />
            <p className="part-text">
              One continuous strip, upright on the outer wall. Green marks the mounting face. The ledge supports its lower edge; the white 45° slope scatters light upward.
            </p>
            <p className="part-caption">
              The floor and inner lip screen the LEDs from below. White PLA may still glow through: check {parameters.segmented ? 'one printed section' : 'a printed prototype'} for opacity and LED heat. Thickness includes LEDs, coating and mounting tape.
            </p>
          </>
        ) : (
          <>
            {parameter('Channel depth', 'channelDepth', [0.6, derived.maximumChannelDepth], 0.1)}
            <p className="part-caption part-caption--accent">
              Top channel: {number01(derived.channelWidth)} mm wide · {number01(derived.floorThickness)} mm underneath.
            </p>
            <p className="part-caption">Use a strip designed to curve sideways. A standard strip needs straight sections joined by wires. Green marks the channel floor.</p>
          </>
        )}
      </div>
      <div className="part-stack part-stack--12">
        <SectionLabel>{derived.continuousCords ? 'CONTINUOUS CORD GUIDES' : 'STRING ATTACHMENTS'}</SectionLabel>
        {parameter('Ring cord clearance', 'cordClearance', [derived.cordRange.lower, derived.cordRange.upper], 0.5)}
        {derived.continuousCords ? (
          <>
            <p className="part-text">
              Three large guides with bevelled edges. Run each main cord continuously from the ceiling hardware, through a guide, to its balloon.{parameters.segmented ? ' The small holes are for alignment pins.' : ''}
            </p>
            <p className="part-caption">
              For the planned 3 × 1 kg balloons: this is an untested prototype, not a load-rated assembly. Use suitable rated cord/hardware and test the printed ring and balloon attachments. The ring still experiences sideways guide forces.
            </p>
          </>
        ) : parameters.reflectedLED ? (
          <>
            <p className="part-text">
              Six bevelled through-holes, alternating around the ring: three for ceiling suspension and three for the balloons. Each group is spaced 120° apart, with a 60° offset between groups.
            </p>
            <p className="part-caption">
              Separate balloon cords put their full weight through the ring. The planned 3 × 1 kg load has not been validated; test the printed ring and attachments before overhead use.
            </p>
          </>
        ) : (
          <>
            <p className="part-text">Six through-holes beside the LED channel. Band width grows automatically to keep material around the holes.</p>
            <button
              type="button"
              className="part-link part-link--medium"
              onClick={() => {
                commitEditing();
                // Read after the commit: the clearance field may just have changed.
                const balloon = useBalloonStore.getState();
                balloon.apply({ ...balloon.parameters, hangingLoop: true, hangingClearance: useRingStore.getState().parameters.cordClearance });
              }}
            >
              <Icon name="link" size={11} />
              Add matching balloon hanger
            </button>
            <p className="part-caption">Export the balloon separately. The printed eyelet has not been load-tested.</p>
          </>
        )}
      </div>
    </>
  );

  const footer = (
    <ExportFooter
      testId="exportRing"
      label={parameters.segmented ? 'Export Ring Kit…' : 'Export Ring STL…'}
      preparingLabel="Preparing ring…"
      savedPrefix="Ring"
      caption={parameters.segmented ? 'ZIP · 4 STL designs + assembly notes' : 'STL · millimetres · checked before export'}
      exporting={model.exporting}
      exported={model.exported}
      // WP-U9 opens the save dialog with the snapshot this returns.
      onExport={() => model.beginExport()}
    />
  );

  // `state` and `p` of the preview (RingEditor.swift:282). Before the first preview the parameters stand in.
  const p = bundle?.parameters ?? parameters;
  const shown = core.ring.derived(p);
  const assembling = !p.segmented || selection === ASSEMBLY;
  const assemblyMesh = exploded && p.segmented ? bundle?.exploded : bundle?.assembled;
  const mesh = (assembling ? assemblyMesh : bundle?.parts[selection - 1]) ?? null;

  const badge =
    p.segmented && assembling
      ? `${Math.trunc(p.diameter)} mm assembly · printed as separate parts`
      : !p.segmented && !shown.fitsP2S
        ? `${Math.trunc(p.diameter)} mm solid ring · exceeds P2S bed`
        : p.segmented && selection === PIN
          ? 'Fits P2S · upright on the small flat end'
          : 'Fits P2S · flat underside on the bed';

  const printHint =
    p.segmented && selection === PIN
      ? 'Print upright · bevelled ends'
      : p.segmented && selection === PLATE
        ? 'Print flat · underside joint plate'
        : 'Print flat · channel up';

  const size = mesh?.dimensions;

  return (
    <PartEditor sidebar={sidebar} footer={footer}>
      <div className="part-row">
        {p.segmented ? (
          <Select
            label="Preview part"
            labelHidden
            testId="ringPreviewPart"
            hug
            className="ring-part-select"
            options={RING_VIEWS}
            value={selection}
            onChange={setSelection}
          />
        ) : (
          <h2 className="part-preview-title">Your solid ring</h2>
        )}
        <PreviewStatus updating={model.updating} />
      </div>
      <StageFrame
        minHeight={280}
        stage={
          <Stage
            mesh={mesh}
            geometryKey={`${model.revision}:${selection}:${exploded}`}
            color={p.reflectedLED ? [0.9, 0.9, 0.9] : FLAT_COLOR}
            showPlate={showPlate && !(p.segmented && assembling)}
            wireframe={wireframe}
            resetCamera={resetCamera}
            cutaway={false}
            inspectOpening={false}
            neckDiameter={0}
            compactObject
            faceColors={mesh?.faceColors}
            detailColor={DETAIL_COLOR}
            topDown={topDown}
            objectName="mobile ring"
            sharpEdges
          />
        }
        badge={badge}
        controls={
          <>
            <button type="button" className="part-stage__button" onClick={() => setTopDown(!topDown)}>
              <Icon name="viewfinder" size={12} />
              {topDown ? 'Angled view' : 'Top view'}
            </button>
            <StageResetButton
              title="Reset ring camera"
              onClick={() => {
                setTopDown(false);
                bumpCamera();
              }}
            />
          </>
        }
      />
      <div className="part-toggles">
        {p.segmented && assembling ? (
          <Checkbox checked={exploded} onChange={setExploded}>
            Exploded assembly
          </Checkbox>
        ) : (
          <span className="part-toggles__hint">{printHint}</span>
        )}
        <span className="part-spacer" />
        {!(p.segmented && assembling) && (
          <Checkbox checked={showPlate} onChange={setShowPlate}>
            Build plate
          </Checkbox>
        )}
        <Checkbox checked={wireframe} onChange={setWireframe}>
          Wireframe
        </Checkbox>
      </div>
      <MetricRow size={20} testId="ringMetrics">
        <Metric
          title={assembling ? 'RING DIAMETER' : 'PART FOOTPRINT'}
          value={assembling ? number01(p.diameter) : size ? `${Math.ceil(size.x)} × ${Math.ceil(size.y)}` : '–'}
          unit="mm"
        />
        <Metric
          title={assembling ? (p.reflectedLED ? 'LED STRIP' : 'LED CHANNEL') : 'PART HEIGHT'}
          value={assembling ? number01(p.reflectedLED ? p.stripWidth : shown.channelWidth) : size ? number01(size.z) : '–'}
          unit={assembling ? 'mm wide' : 'mm'}
        />
        <Metric
          title={assembling ? 'STRIP PATH ≈' : 'PRINT QUANTITY'}
          value={assembling ? String(roundHalfAwayFromZero(shown.stripPathLength)) : String(selection === PIN ? 12 : selection === PLATE ? 6 : 3)}
          unit={assembling ? 'mm' : 'copies'}
        />
      </MetricRow>
      <div className="ring-advice">
        {shown.continuousCords ? <ContinuousCordDiagram /> : <SeparateCordDiagram />}
        <div className="ring-advice__text">
          <p className="ring-advice__title">{shown.continuousCords ? 'Main cords continue through the ring' : '3 ceiling holes + 3 balloon holes'}</p>
          <p className="part-text">
            {shown.continuousCords
              ? 'Ceiling hardware → guide → balloon. Use a retainer below each guide to support the ring on the cord. The ring still carries sideways guide forces and has not been load-tested.'
              : 'Alternate ceiling and balloon cords around the ring. Join the three ceiling cords above it; attach a balloon to each of the three holes in between.'}
          </p>
          <p className="part-caption part-caption--accent-plain">
            {p.segmented
              ? 'Print 3 A + 3 B + 6 plates + 12 pins. Glue A–B–A–B–A–B; fit the LEDs after curing.'
              : p.reflectedLED
                ? `6 bevelled attachment holes · ${number01(p.stripWidth)} mm LED strip · ring carries balloon weight`
                : `Balloon ties are ${Math.trunc(shown.balloonSpacing)} mm apart; stagger larger balloons in height.`}
          </p>
        </div>
      </div>
      <RingGuideSheet open={showInstructions} parameters={parameters} onDone={() => setShowInstructions(false)} />
      <AlertDialog open={model.error !== null} title="Ring export failed" message={model.error ?? ''} onDismiss={() => model.setError(null)} />
    </PartEditor>
  );
}
