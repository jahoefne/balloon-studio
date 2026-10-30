// `CableClipEditor` (mac/Sources/BalloonStudio/CableClipEditor.swift:80-276). The sidebar reads the
// derived fields from the parameter API, so they follow the parameters at once; the preview column
// reads the last finished kit, as the Mac does, so its numbers match the mesh on screen.

import { useEffect, useState } from 'react';
import { core } from '#core/parameters';
import { CABLE_CLIP_MOUNT_INFO, CABLE_CLIP_MOUNTS, type CableClipParameters } from '../../core/types';
import { Stage } from '../../preview';
import { useClipStore } from '../../stores';
import type { ClipStore } from '../../stores/clipStore';
import {
  AdviceRow,
  AlertDialog,
  Checkbox,
  Metric,
  MetricRow,
  number02 as number,
  ParameterControl,
  roundHalfAwayFromZero,
  SectionLabel,
  SegmentedControl,
} from '../../ui';
import { Caption, ExportButton, FooterStatus, NoteLabel, rangeOf, StageFrame, swatchColor, Swatches, type SwatchOption } from '../shared/editorParts';

type ClipView = 'assembled' | 'print';

const COLORS: readonly SwatchOption[] = (
  [
    ['Linen', swatchColor(0.86, 0.80, 0.68)],
    ['Wall white', swatchColor(0.93, 0.92, 0.89)],
    ['Black', swatchColor(0.17, 0.17, 0.18)],
    ['Grey', swatchColor(0.56, 0.56, 0.57)],
    ['Sage', swatchColor(0.19, 0.57, 0.49)],
  ] as const
).map(([name, color]) => ({ color, help: `${name} · preview only`, label: `${name} · preview only` }));

const CABLE_COLOR = swatchColor(0.80, 0.75, 0.66);
const NAIL_COLOR = swatchColor(0.55, 0.56, 0.58);

type NumberKey = { [K in keyof CableClipParameters]: CableClipParameters[K] extends number ? K : never }[keyof CableClipParameters];

export interface CableClipEditorProps {
  /** Tests and the demo page pass their own. */
  store?: ClipStore | undefined;
  /** Receives the snapshot of `beginExport()`; WP-U9 runs the file flow. */
  onExport?: ((parameters: CableClipParameters) => void) | undefined;
}

export function CableClipEditor({ store = useClipStore, onExport }: CableClipEditorProps) {
  const state = store();
  const { parameters: p, bundle: kit, revision, updating, exporting, exported, error } = state;
  const c = core.clip.clip(p);
  const ranges = core.clip.ranges;

  const [selection, setSelection] = useState<ClipView>('assembled');
  const [showPlate, setShowPlate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [topDown, setTopDown] = useState(false);
  const [resetCamera, setResetCamera] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);

  useEffect(() => store.getState().ensurePreview(), [store]);

  const parameter = (title: string, key: NumberKey, range: { lower: number; upper: number }, step: number) => (
    <ParameterControl title={title} value={p[key]} onChange={(value) => state.setField(key, value)} range={rangeOf(range)} step={step} unit="mm" />
  );

  const startExport = () => {
    const parameters = state.beginExport();
    if (parameters !== null) onExport?.(parameters);
  };

  const assembly = selection === 'assembled';
  const shownParameters = kit?.parameters ?? p;
  const shownClip = kit?.clip ?? c;
  const mesh = kit && (assembly ? kit.assemblyMesh : kit.printMesh);
  const strained = c.snapStrain > 0.022;
  const color = COLORS[colorIndex]!.color;

  return (
    <div className="fc-editor" data-testid="cableClipEditor">
      <div className="fc-sidebar">
        <div className="fc-sidebar__scroll">
          <section className="fc-group fc-group--13">
            <SectionLabel>CABLE</SectionLabel>
            {parameter('Cable diameter', 'cableDiameter', ranges.cable, 0.05)}
            <Caption>{"Measure the lead over its fabric sheath. The strap's arch is 0.1 mm wider than the cable, which lies on the plate."}</Caption>
          </section>

          <hr className="fc-divider" />

          <section className="fc-group fc-group--12">
            <SectionLabel>WALL FIXING</SectionLabel>
            <SegmentedControl
              hug
              label="Wall fixing"
              options={CABLE_CLIP_MOUNTS.map((mount) => ({ value: mount, label: CABLE_CLIP_MOUNT_INFO[mount].title }))}
              value={p.mount}
              onChange={state.selectMount}
            />
            <Caption>{CABLE_CLIP_MOUNT_INFO[p.mount].subtitle}</Caption>
            {parameter('Plate thickness', 'plate', ranges.plate, 0.1)}
            {c.plateThickness > p.plate + 1e-9 && (
              <Caption>The plate is {number(c.plateThickness)} mm here: at least 0.6 mm thicker than the nail head, so the head sinks in flush.</Caption>
            )}
            {p.mount === 'nail' ? (
              <>
                {parameter('Nail shaft', 'nailDiameter', ranges.nail, 0.1)}
                {parameter('Nail head', 'nailHeadDiameter', ranges.head, 0.1)}
                {parameter('Head height', 'nailHeadHeight', ranges.headHeight, 0.1)}
                {parameter('Nail gap from the strap', 'nailGap', ranges.nailGap, 0.5)}
                <Caption>
                  {`The plate runs ${number(c.plateEnd - p.length / 2)} mm past the strap on one side. The head's counterbore, ${number(c.counterbore)} mm wide and ${number(c.counterboreDepth)} mm deep, starts ${number((c.nailY ?? 0) - c.counterbore / 2 - p.length / 2)} mm past the strap: that is the room the hammer or a nail punch has. The whole clip is ${number(c.length)} mm long.`}
                </Caption>
              </>
            ) : (
              <Caption>
                {`The plate is ${number(c.halfWidth + c.edgeX)} mm wide under the strap and ${number(c.length)} mm long, about ${roundHalfAwayFromZero(c.padArea)} mm² of glue pad.`}
              </Caption>
            )}
            {c.problem !== null ? (
              <NoteLabel alert icon="exclamationmark.triangle" tone="warning" testId="clipProblem">
                {c.problem}
              </NoteLabel>
            ) : (
              c.note !== null && (
                <NoteLabel icon="info.circle" tone="secondary" testId="clipNote">
                  {c.note}
                </NoteLabel>
              )
            )}
          </section>

          <hr className="fc-divider" />

          <section className="fc-group fc-group--12">
            <SectionLabel>STRAP</SectionLabel>
            {parameter('Length along the cable', 'length', ranges.length, 0.5)}
            {parameter('Thickness', 'wall', ranges.wall, 0.1)}
            {parameter('Overlap below the cable', 'overlap', ranges.overlap, 0.1)}
            <Caption>
              {`The strap is the spring. A thinner strap bends further; more overlap holds the cable better but needs a wider opening. On the open side the plate ends ${number(c.edgeX)} mm past the cable's middle under the strap, so the passage between the tip and the plate's edge is ${number(c.opening)} mm, and the cable lifts the strap about ${number(c.insertion)} mm on its way in.`}
            </Caption>
            <NoteLabel icon={strained ? 'exclamationmark.triangle' : 'arrow.up.and.down'} tone={strained ? 'warning' : 'accent'} medium testId="clipStrain">
              Strain about {number(c.snapStrain * 100)} % as the cable goes in · PLA takes about 2 %, PETG more
            </NoteLabel>
          </section>

          <hr className="fc-divider" />

          <section className="fc-group fc-group--12">
            <SectionLabel>PRINT</SectionLabel>
            <Checkbox size={12} checked={p.flat} onChange={state.setFlat}>
              Print lying on the plate
            </Checkbox>
            <Caption>
              {p.flat
                ? 'Lying flat the plate is on the bed and the arch is bridged, but the strap bends across its layers: PETG rather than PLA.'
                : "Standing on the strap's end, the profile lies on the bed and the strap bends within its layers. Use a brim."}
            </Caption>
          </section>
        </div>

        <div className="fc-footer">
          <ExportButton
            label="Export Clip STL…"
            preparingLabel="Preparing clip…"
            exporting={exporting}
            blocked={c.problem !== null}
            testId="exportCableClip"
            onClick={startExport}
          />
          <FooterStatus exported={exported} idle="One STL · print orientation · millimetres" />
        </div>
      </div>

      <div className="fc-preview">
        <div className="fc-preview__head">
          <SegmentedControl<ClipView>
            hug
            label="Clip view"
            testId="cableClipPreviewPart"
            options={[
              { value: 'assembled', label: 'On the wall' },
              { value: 'print', label: 'Print view' },
            ]}
            value={selection}
            onChange={setSelection}
          />
          <span className="fc-preview__name">{core.clip.names(shownParameters).displayName}</span>
          <span className="fc-preview__status" aria-live="polite">{updating ? 'Updating…' : 'Live preview'}</span>
        </div>

        <StageFrame
          badge={
            assembly
              ? 'On the wall · press the cable in from the open side'
              : shownParameters.flat
                ? 'Lying on the plate · arch bridged · no supports'
                : "Standing on the strap's end · profile on the bed · brim"
          }
          badgeIcon={assembly ? 'cable.connector.horizontal' : 'printer'}
          viewLabel={topDown ? 'Angled view' : 'Face view'}
          onView={() => setTopDown(!topDown)}
          resetHelp="Reset clip camera"
          onReset={() => {
            setTopDown(false);
            setResetCamera(resetCamera + 1);
          }}
        >
          <Stage
            mesh={mesh}
            geometryKey={`${revision}:${selection}`}
            color={color}
            showPlate={showPlate}
            wireframe={wireframe}
            resetCamera={resetCamera}
            cutaway={false}
            inspectOpening={false}
            neckDiameter={0}
            compactObject
            faceColors={assembly ? mesh?.faceColors : undefined}
            detailColor={color}
            accentColor={CABLE_COLOR}
            hardwareColor={NAIL_COLOR}
            minimumScale={assembly ? 14 : 10}
            topDown={topDown}
            objectName="cable clip"
            sharpEdges
            smoothAngle={Math.PI / 5}
          />
        </StageFrame>

        <div className="fc-controls">
          <Swatches options={COLORS} selected={colorIndex} onSelect={setColorIndex} ringed />
          <span className="fc-controls__hint">Colour · preview only</span>
          <span className="fc-controls__spacer" />
          <Checkbox checked={showPlate} onChange={setShowPlate}>
            {assembly ? 'Wall' : 'Build plate'}
          </Checkbox>
          <Checkbox checked={wireframe} onChange={setWireframe}>
            Wireframe
          </Checkbox>
        </div>

        <MetricRow size={15}>
          <Metric title="SIZE" value={`${number(shownClip.width)} × ${number(shownClip.length)} × ${number(shownClip.height)}`} unit="mm" />
          <Metric title="OPENING" value={`${number(shownClip.opening)} · lifts ${number(shownClip.insertion)}`} unit="mm" />
          <Metric
            title="BEYOND THE CABLE"
            value={`+${number(shownClip.width - shownParameters.cableDiameter)} wide · +${number(shownClip.height - shownParameters.cableDiameter)} tall`}
            unit="mm"
          />
        </MetricRow>

        <AdviceRow icon="hand.tap" title="Nail the plate, then press the cable in from the open side">
          The nail sits past the strap, so the hammer never touches it; finish with a nail punch. The strap springs open for the cable and closes over it. A clip every 30 to 40 cm, two near a turn. The spring is not yet confirmed in print.
        </AdviceRow>
      </div>

      <AlertDialog open={error !== null} title="Clip export failed" message={error ?? ''} onDismiss={() => state.setError(null)} />
    </div>
  );
}
