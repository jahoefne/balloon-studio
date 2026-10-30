import { core } from '#core/parameters';
import { formatFixed, printfFixed } from '../../core/swift/format';
import { calibrated, calibratedHex, Stage } from '../../preview';
import { useAppStore, useBalloonStore } from '../../stores';
import { AdviceRow, Checkbox, filamentHex, Icon, Metric, MetricRow } from '../../ui';
import { PurgeSummary } from './PurgeSummary';

// ContentView's `preview` (BalloonStudioApp.swift:496-598).

const COLORS = [calibrated(0.86, 0.43, 0.18), calibrated(0.19, 0.57, 0.49), calibrated(0.71, 0.76, 0.85), calibrated(0.73, 0.31, 0.36)];
const COLOR_NAMES = ['Saffron', 'Sage', 'Porcelain', 'Rose'];

const toCSS = ([r, g, b]: readonly [number, number, number]): string => `rgb(${r * 255} ${g * 255} ${b * 255})`;

export function BalloonPreviewColumn() {
  const parameters = useBalloonStore((state) => state.parameters);
  const pattern = useBalloonStore((state) => state.pattern);
  const mesh = useBalloonStore((state) => state.bundle?.mesh ?? null);
  const faceColors = useBalloonStore((state) => state.faceColors);
  const revision = useBalloonStore((state) => state.revision);
  const updating = useBalloonStore((state) => state.updating);
  const openedSTLName = useBalloonStore((state) => state.openedSTLName);
  const uses3MF = useBalloonStore((state) => state.uses3MF());
  const view = useAppStore((state) => state.balloonView);
  const setView = useAppStore((state) => state.setBalloonView);

  const { hollow, hangingLoop } = parameters;
  const { hasStringHoles, openingDiameter, totalHeight } = core.balloon.derived(parameters);
  const { hasRelief, baseColor, detailColor } = core.balloon.pattern.derived(pattern, parameters);
  const neckInView = hollow || hasStringHoles;
  const inspectOpening = view.inspectOpening && neckInView;
  // The Mac has a mesh from launch on; until the first preview there is nothing to warn about.
  const maxOverhang = mesh?.maxOverhang ?? 0;
  const overhanging = maxOverhang > 45;

  return (
    <div className="balloon-preview">
      <div className="balloon-preview__head">
        <h2 className="balloon-preview__title">{openedSTLName === null ? 'Your envelope' : 'Editable balloon'}</h2>
        {updating ? (
          <span className="balloon-preview__status">Updating…</span>
        ) : (
          <span className="balloon-preview__live">
            <Icon name="circle.fill" size={8} />
            Live preview
          </span>
        )}
      </div>
      <div className="balloon-stage">
        <div className="balloon-stage__canvas">
          <Stage
            mesh={mesh}
            geometryKey={String(revision)}
            color={uses3MF ? calibratedHex(filamentHex(baseColor)) : COLORS[view.colorIndex]!}
            showPlate={view.showPlate && !view.inspectTop && !inspectOpening}
            wireframe={view.wireframe}
            resetCamera={view.resetCamera}
            cutaway={view.cutaway && hollow}
            inspectOpening={inspectOpening}
            neckDiameter={parameters.neckDiameter}
            neckHeight={parameters.neckHeight}
            filledNeck={!hollow}
            inspectTop={view.inspectTop && hangingLoop}
            faceColors={uses3MF ? (faceColors ?? undefined) : undefined}
            detailColor={calibratedHex(filamentHex(detailColor))}
          />
        </div>
        <div className="balloon-stage__badge">
          <span className="balloon-stage__fit">
            <Icon name="checkmark.circle.fill" size={12} />
          </span>
          <span>Fits P2S</span>
          <span className="balloon-stage__volume">256³ mm</span>
        </div>
        <div className="balloon-stage__controls">
          <span className="balloon-stage__hint">Drag to orbit  ·  Scroll to zoom</span>
          {neckInView && (
            <button
              type="button"
              className="balloon-stage__button"
              onClick={() => setView({ inspectOpening: !view.inspectOpening, inspectTop: false, cutaway: false })}
            >
              <Icon name="viewfinder" size={12} />
              {view.inspectOpening ? 'Whole balloon' : hollow ? 'View opening' : 'View neck'}
            </button>
          )}
          {hangingLoop && (
            <button type="button" className="balloon-stage__button" onClick={() => setView({ inspectTop: !view.inspectTop, inspectOpening: false, cutaway: false })}>
              <Icon name="viewfinder" size={12} />
              {view.inspectTop ? 'Whole balloon' : 'View hanger'}
            </button>
          )}
          <button
            type="button"
            className="balloon-stage__button balloon-stage__button--icon"
            title="Reset camera"
            aria-label="Reset camera"
            onClick={() => setView({ inspectOpening: false, inspectTop: false, resetCamera: view.resetCamera + 1 })}
          >
            <Icon name="arrow.counterclockwise" size={13} />
          </button>
        </div>
      </div>
      <div className="balloon-preview__toggles">
        {!uses3MF &&
          COLORS.map((color, i) => (
            <button
              key={COLOR_NAMES[i]}
              type="button"
              className="balloon-swatch"
              title={`${COLOR_NAMES[i]} · preview color only`}
              aria-label={`${COLOR_NAMES[i]} preview color`}
              aria-pressed={view.colorIndex === i}
              style={{ color: toCSS(color) }}
              onClick={() => setView({ colorIndex: i })}
            />
          ))}
        <span className="balloon-preview__spacer" />
        {hollow && (
          <Checkbox
            checked={view.cutaway}
            help="Preview the cavity. The exported file always contains the complete shell."
            onChange={(cutaway) => setView(cutaway ? { cutaway, inspectOpening: false, inspectTop: false } : { cutaway })}
          >
            Cutaway
          </Checkbox>
        )}
        <Checkbox checked={view.showPlate} onChange={(showPlate) => setView({ showPlate })}>
          Build plate
        </Checkbox>
        <Checkbox checked={view.wireframe} onChange={(wireframe) => setView({ wireframe })}>
          Wireframe
        </Checkbox>
      </div>
      {uses3MF && <PurgeSummary />}
      <MetricRow testId="balloonMetrics">
        <Metric
          title="DIAMETER"
          value={!hasRelief ? String(Math.trunc(parameters.diameter)) : mesh === null ? '–' : printfFixed(Math.max(mesh.dimensions.x, mesh.dimensions.y), 1)}
          unit="mm"
        />
        <Metric title="TOTAL HEIGHT" value={formatFixed(totalHeight, 1)} unit="mm" />
        {hollow ? <Metric title="LED OPENING" value={formatFixed(openingDiameter, 1)} unit="mm" /> : <Metric title="PANELS" value={String(parameters.panels)} />}
      </MetricRow>
      <AdviceRow
        icon={hollow || overhanging ? 'exclamationmark.triangle' : 'info.circle'}
        tone={overhanging ? 'warning' : 'accent'}
        title={hollow ? 'Shell printing · 0% infill' : overhanging ? 'Check supports in your slicer' : 'Ready to make it real'}
        testId="balloonAdvice"
      >
        {hollow
          ? 'Use standard mode, not vase mode. Print neck down with a brim. The hollow crown may need supports; inspect your sliced layers.'
          : overhanging
            ? `Outward overhang reaches ${Math.ceil(maxOverhang)}° from vertical. Inspect the sliced layers before printing.`
            : 'Try 0.2 mm layers, 3 walls, 10% infill and an 8 mm brim. Print with the flat neck down.'}
      </AdviceRow>
    </div>
  );
}
