// BasketEditor.swift:85-255.

import { useEffect, useId, useState } from 'react';
import { core } from '#core/parameters';
import { BASKET_STYLE_INFO, BASKET_STYLES, type BasketParameters, type BasketStyle } from '../../core/types';
import { calibrated, Stage } from '../../preview';
import { useBalloonStore, useBasketStore } from '../../stores';
import {
  AdviceRow,
  AlertDialog,
  Checkbox,
  commitEditing,
  Icon,
  Metric,
  MetricRow,
  number01,
  ParameterControl,
  SectionLabel,
  type SymbolName,
} from '../../ui';
import { ExportFooter, PartEditor, PreviewStatus, StageFrame, StageResetButton } from '../shared/PartEditor';
import './basket.css';

type NumericKey = Exclude<keyof BasketParameters, 'style'>;

// BasketEditor.swift:93-97
const COLORS: readonly (readonly [number, number, number])[] = [
  calibrated(0.67, 0.4, 0.19),
  calibrated(0.73, 0.74, 0.68),
  calibrated(0.22, 0.46, 0.39),
];
const cssColor = ([r, g, b]: readonly [number, number, number]) => `rgb(${r * 255} ${g * 255} ${b * 255})`;

export function BasketEditor() {
  const model = useBasketStore();
  const balloon = useBalloonStore((state) => state.parameters);
  const [showPlate, setShowPlate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [resetCamera, setResetCamera] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);

  // The Mac model builds its first mesh in `init`; here a tab shown first needs a nudge. No-op otherwise.
  useEffect(() => useBasketStore.getState().ensurePreview(), []);

  const { parameters } = model;
  const derived = core.basket.derived(parameters);

  const parameter = (title: string, key: NumericKey, range: readonly [number, number], unit: string, step = 1) => (
    <ParameterControl title={title} value={parameters[key]} onChange={(value) => model.setField(key, value)} range={range} step={step} unit={unit} />
  );

  const holesMatch = core.balloon.derived(balloon).hasStringHoles && Math.abs(balloon.cordClearance - parameters.cordClearance) < 0.01;

  const sidebar = (
    <>
      <div className="part-stack part-stack--8">
        <SectionLabel>CHOOSE A BASKET</SectionLabel>
        {BASKET_STYLES.map((style) => (
          <StyleCard key={style} style={style} selected={parameters.style === style} onSelect={() => model.selectStyle(style)} />
        ))}
      </div>
      <div className="part-stack">
        <div className="part-row">
          <SectionLabel>DIMENSIONS</SectionLabel>
          <button
            type="button"
            className="part-link"
            title="Size this basket in proportion to the current balloon."
            onClick={() => model.match(useBalloonStore.getState().parameters)}
          >
            Match balloon
          </button>
        </div>
        {parameter(parameters.style === 'ribbed' ? 'Diameter' : 'Width', 'width', [40, 100], 'mm')}
        {parameters.style !== 'ribbed' && parameter('Depth', 'depth', [30, 90], 'mm')}
        {parameter('Basket height', 'height', [24, 70], 'mm')}
        {parameter('Basket wall', 'wallThickness', [1.6, 3.2], 'mm', 0.2)}
        {parameter('Surface detail', 'texture', [0, 1], '', 0.1)}
      </div>
      <hr className="part-divider" />
      <div className="part-stack part-stack--12">
        <SectionLabel>STRING ATTACHMENTS</SectionLabel>
        {parameter('Cord clearance', 'cordClearance', [2, 5], 'mm', 0.5)}
        <p className="part-text">Four round holes with beveled edges, one on each side. Choose clearance larger than your string.</p>
        <button
          type="button"
          className="part-wash-button"
          onClick={() => {
            commitEditing();
            // Read after the commit: the clearance field may just have changed.
            useBalloonStore.getState().addStringHoles(useBasketStore.getState().parameters.cordClearance);
          }}
        >
          <Icon name="link" size={11} />
          {holesMatch ? 'Balloon holes match' : 'Add matching balloon holes'}
        </button>
        <p className="part-caption">Works with filled and hollow balloons. The neck may become taller or wider. Export the updated balloon separately.</p>
      </div>
    </>
  );

  const footer = (
    <ExportFooter
      testId="exportBasket"
      label="Export Basket STL…"
      preparingLabel="Preparing basket…"
      savedPrefix="Basket"
      caption="Separate STL · four string holes · millimetres"
      exporting={model.exporting}
      exported={model.exported}
      // WP-U9 opens the save dialog with the snapshot this returns.
      onExport={() => model.beginExport()}
    />
  );

  return (
    <PartEditor sidebar={sidebar} footer={footer}>
      <div className="part-row">
        <h2 className="part-preview-title">{BASKET_STYLE_INFO[parameters.style].title} basket</h2>
        <PreviewStatus updating={model.updating} />
      </div>
      <StageFrame
        minHeight={310}
        stage={
          <Stage
            mesh={model.bundle?.mesh ?? null}
            geometryKey={String(model.revision)}
            color={COLORS[colorIndex]!}
            showPlate={showPlate}
            wireframe={wireframe}
            resetCamera={resetCamera}
            cutaway={cutaway}
            inspectOpening={false}
            neckDiameter={0}
            compactObject
            sharpEdges
            smoothAngle={Math.PI / 6}
            smoothBelowHeight={derived.holeCenter - parameters.cordClearance / 2 - 0.6}
          />
        }
        badgeIcon="link"
        badge="4 cord holes · open top"
        controls={<StageResetButton title="Reset basket camera" onClick={() => setResetCamera((n) => n + 1)} />}
      />
      <div className="part-toggles">
        {COLORS.map((color, index) => (
          <button
            key={index}
            type="button"
            className="part-swatch"
            title="Preview colour only"
            aria-label={`Preview colour ${index + 1}`}
            aria-pressed={colorIndex === index}
            onClick={() => setColorIndex(index)}
          >
            <span className="part-swatch__dot" style={{ background: cssColor(color) }} />
          </button>
        ))}
        <span className="part-spacer" />
        <Checkbox checked={cutaway} onChange={setCutaway}>
          Cutaway
        </Checkbox>
        <Checkbox checked={showPlate} onChange={setShowPlate}>
          Build plate
        </Checkbox>
        <Checkbox checked={wireframe} onChange={setWireframe}>
          Wireframe
        </Checkbox>
      </div>
      <MetricRow size={21}>
        <Metric title="FOOTPRINT" value={`${Math.trunc(parameters.width)} × ${Math.trunc(derived.actualDepth)}`} unit="mm" />
        <Metric title="HEIGHT" value={String(Math.trunc(parameters.height))} unit="mm" />
        <Metric title="CORD CLEARANCE" value={number01(parameters.cordClearance)} unit="mm" />
      </MetricRow>
      <AdviceRow icon="link" title="Print separately, then string together">
        Print flat base down. Tie four equal-length strings through the basket holes and the matching balloon neck holes.
      </AdviceRow>
      <AlertDialog open={model.error !== null} title="Basket export failed" message={model.error ?? ''} onDismiss={() => model.setError(null)} />
    </PartEditor>
  );
}

function StyleCard({ style, selected, onSelect }: { style: BasketStyle; selected: boolean; onSelect: () => void }) {
  const { title, subtitle, symbol } = BASKET_STYLE_INFO[style];
  const subtitleId = useId();
  return (
    <button type="button" className="part-card" aria-label={`${title} basket`} aria-describedby={subtitleId} aria-pressed={selected} onClick={onSelect}>
      <span className="part-card__icon">
        <Icon name={symbol as SymbolName} size={20} />
      </span>
      <span className="part-card__text">
        <span className="part-card__title">{title}</span>
        <span id={subtitleId} className="part-card__subtitle">{subtitle}</span>
      </span>
      {selected && <Icon name="checkmark" size={10} className="part-card__check" />}
    </button>
  );
}
