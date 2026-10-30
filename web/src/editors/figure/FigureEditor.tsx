// `FigureEditor` (mac/Sources/BalloonStudio/FigureEditor.swift:79-264).

import { useEffect, useId, useState } from 'react';
import { core } from '#core/parameters';
import {
  FIGURE_STYLE_INFO,
  FIGURE_STYLES,
  FIGURE_SURFACE_INFO,
  FIGURE_SURFACES,
  type FigureParameters,
} from '../../core/types';
import { Stage } from '../../preview';
import { useFigureStore } from '../../stores';
import type { FigureStore } from '../../stores/figureStore';
import {
  AdviceRow,
  AlertDialog,
  Button,
  Checkbox,
  Icon,
  Metric,
  MetricRow,
  number01,
  ParameterControl,
  SectionLabel,
  SegmentedControl,
} from '../../ui';
import type { ExportInputs } from '../../worker/protocol';
import { Caption, ExportButton, FooterStatus, NoteLabel, rangeOf, StageFrame, swatchColor, Swatches, type SwatchOption } from '../shared/editorParts';
import { FigureSilhouette } from './FigureSilhouette';

const COLORS: readonly SwatchOption[] = [
  swatchColor(0.98, 0.85, 0.42),
  swatchColor(0.62, 0.78, 0.92),
  swatchColor(0.95, 0.72, 0.74),
  swatchColor(0.70, 0.85, 0.72),
  swatchColor(0.78, 0.72, 0.90),
].map((color, i) => ({ color, help: 'Preview colour only', label: `Preview colour ${i + 1}` }));

const DETAIL_COLOR = [0.82, 0.82, 0.82] as const; // NSColor(white:0.82, alpha:1)

export interface FigureEditorProps {
  /** Tests and the demo page pass their own. */
  store?: FigureStore | undefined;
  /** Receives the snapshot of `beginExport()` with the chosen variant; WP-U9 runs the file flow. */
  onExport?: ((request: ExportInputs['figure']) => void) | undefined;
}

export function FigureEditor({ store = useFigureStore, onExport }: FigureEditorProps) {
  const state = store();
  const { parameters: p, bundle: body, revision, updating, exporting, exported, error } = state;
  const derived = core.figure.derived(p);
  const ranges = core.figure.ranges;

  const [showPlate, setShowPlate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [hanging, setHanging] = useState(true);
  const [resetCamera, setResetCamera] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);
  const cardIds = useId();

  useEffect(() => store.getState().ensurePreview(), [store]);

  const parameter = (title: string, key: 'height' | 'edge' | 'dome' | 'holeDiameter' | 'holeMargin', range: { lower: number; upper: number }, step = 1) => (
    <ParameterControl title={title} value={p[key]} onChange={(value) => state.setField(key, value)} range={rangeOf(range)} step={step} unit="mm" />
  );

  const startExport = (variant: 'single' | 'set') => {
    const parameters: FigureParameters | null = state.beginExport();
    if (parameters !== null) onExport?.({ parameters, variant });
  };

  const mesh = body && (hanging ? body.hangingMesh : body.printMesh);

  return (
    <div className="fc-editor" data-testid="figureEditor">
      <div className="fc-sidebar">
        <div className="fc-sidebar__scroll">
          <section className="fc-group fc-group--8">
            <SectionLabel>CHOOSE A FIGURE</SectionLabel>
            {FIGURE_STYLES.map((style) => {
              const selected = p.style === style;
              const info = FIGURE_STYLE_INFO[style];
              const subtitleId = `${cardIds}-${style}`;
              return (
                <button
                  key={style}
                  type="button"
                  className="fc-card"
                  aria-label={`${info.title} figure`}
                  aria-describedby={subtitleId}
                  aria-pressed={selected}
                  data-testid={`figureStyle-${style}`}
                  onClick={() => state.selectStyle(style)}
                >
                  <FigureSilhouette style={style} className="fc-card__silhouette" />
                  <span className="fc-card__text">
                    <span className="fc-card__title">{info.title}</span>
                    <span id={subtitleId} className="fc-card__subtitle">{info.subtitle}</span>
                  </span>
                  {selected && <Icon name="checkmark" size={10} />}
                </button>
              );
            })}
          </section>

          <section className="fc-group fc-group--13">
            <SectionLabel>{'SIZE & BODY'}</SectionLabel>
            {parameter('Height', 'height', ranges.height)}
            <SegmentedControl
              hug
              label="Figure surface"
              options={FIGURE_SURFACES.map((surface) => ({ value: surface, label: FIGURE_SURFACE_INFO[surface].title }))}
              value={p.surface}
              onChange={state.selectSurface}
            />
            <Caption>{FIGURE_SURFACE_INFO[p.surface].subtitle}</Caption>
            {parameter(derived.domed ? 'Edge band' : 'Thickness', 'edge', ranges.edge, 0.2)}
            {derived.domed && (
              <>
                {parameter('Dome height', 'dome', ranges.dome, 0.2)}
                <Checkbox size={12} checked={p.doubleSided} onChange={state.setDoubleSided}>
                  Domed on both sides
                </Checkbox>
                <Caption>
                  {p.doubleSided
                    ? 'Needs supports under the lower dome. Or print the flat-backed figure twice and glue the pair back to back.'
                    : 'The flat back prints without supports and sits well on the bed.'}
                </Caption>
              </>
            )}
          </section>

          <hr className="fc-divider" />

          <section className="fc-group fc-group--12">
            <SectionLabel>HANGING</SectionLabel>
            {parameter('Thread hole', 'holeDiameter', ranges.hole, 0.5)}
            {parameter('Material around hole', 'holeMargin', ranges.margin, 0.5)}
            <Checkbox size={12} checked={p.chainHole} onChange={state.setChainHole}>
              Second hole at the bottom
            </Checkbox>
            <Caption>
              {p.chainHole
                ? 'For a figure hanging below this one: raindrops under a cloud, a star under the moon.'
                : 'The hole sits as high as the figure allows, right above its centre of gravity, so it hangs straight.'}
            </Caption>
            {body && body.holes < body.holesWanted && (
              <NoteLabel alert icon="exclamationmark.triangle" tone="warning" testId="figureHoleWarning">
                {body.hangingHole === null
                  ? 'No room for the thread hole: make the figure taller or the hole smaller.'
                  : 'No room for the second hole: make the figure taller or the hole smaller.'}
              </NoteLabel>
            )}
          </section>
        </div>

        <div className="fc-footer">
          <ExportButton
            label="Export Figure STL…"
            preparingLabel="Preparing figure…"
            exporting={exporting}
            testId="exportFigure"
            onClick={() => startExport('single')}
          />
          <Button variant="plain" className="fc-set-export" disabled={exporting} testId="exportFigureSet" onClick={() => startExport('set')}>
            <Icon name="square.stack.3d.up" size={12} />
            Export all seven as a set (ZIP)…
          </Button>
          <FooterStatus exported={exported} idle="One STL per figure · thread hole included · millimetres" />
        </div>
      </div>

      <div className="fc-preview">
        <div className="fc-preview__head">
          <h2 className="fc-preview__title">{FIGURE_STYLE_INFO[p.style].title} figure</h2>
          <span className="fc-preview__status" aria-live="polite">{updating ? 'Updating…' : 'Live preview'}</span>
        </div>

        <StageFrame
          badge={
            hanging
              ? 'As it hangs · thread through the hole'
              : derived.sides === 2
                ? 'Print view · supports under the lower dome'
                : 'Print view · flat back on the bed'
          }
          badgeIcon={hanging ? 'link' : 'printer'}
          viewLabel={hanging ? 'Print view' : 'Hanging view'}
          onView={() => {
            setHanging(!hanging);
            setResetCamera(resetCamera + 1);
          }}
          resetHelp="Reset figure camera"
          onReset={() => setResetCamera(resetCamera + 1)}
        >
          <Stage
            mesh={mesh}
            geometryKey={`${revision}:${hanging ? 'hanging' : 'print'}`}
            color={COLORS[colorIndex]!.color}
            showPlate={showPlate && !hanging}
            wireframe={wireframe}
            resetCamera={resetCamera}
            cutaway={false}
            inspectOpening={false}
            neckDiameter={0}
            compactObject
            faceColors={hanging ? mesh?.faceColors : undefined}
            detailColor={DETAIL_COLOR}
            minimumScale={40}
            objectName="figure"
            sharpEdges
            smoothAngle={derived.domed ? Math.PI / 5 : 0}
          />
        </StageFrame>

        <div className="fc-controls">
          <Swatches options={COLORS} selected={colorIndex} onSelect={setColorIndex} />
          <span className="fc-controls__spacer" />
          {!hanging && (
            <Checkbox checked={showPlate} onChange={setShowPlate}>
              Build plate
            </Checkbox>
          )}
          <Checkbox checked={wireframe} onChange={setWireframe}>
            Wireframe
          </Checkbox>
        </div>

        <MetricRow size={21}>
          <Metric title="SIZE" value={`${number01(body?.width ?? derived.width)} × ${number01(p.height)}`} unit="mm" />
          <Metric title="THICKNESS" value={number01(derived.thickness)} unit="mm" />
          <Metric title="THREAD HOLE" value={`Ø ${number01(p.holeDiameter)}${body?.holes === 2 ? ' · 2' : ''}`} unit="mm" />
        </MetricRow>

        <AdviceRow icon="link" title="Print flat back down, then thread and hang">
          {"No supports needed. Tie a loop through the hole and hang the figures from the mobile ring at different heights, out of the baby's reach."}
        </AdviceRow>
      </div>

      <AlertDialog open={error !== null} title="Figure export failed" message={error ?? ''} onDismiss={() => state.setError(null)} />
    </div>
  );
}
