import { core } from '#core/parameters';
import { CLOUD_VIEW_TITLE, CLOUD_VIEWS, WALL_LAMP_KIND_INFO, type CloudParameters, type CloudPreview, type CloudView } from '../../core/types';
import { Stage } from '../../preview';
import { Button, Checkbox, Icon, Metric, MetricRow, Select } from '../../ui';
import { CLAMP_COLOR, isAssemblyView, number, SEAL_COLOR, viewCaption, viewStyle } from './presentation';

// `preview` of CloudEditor.swift:384-455.

export interface CloudPreviewPaneProps {
  /** The model's parameters; the preview shows the kit's, which follow after the rebuild. */
  parameters: CloudParameters;
  kit: CloudPreview | null;
  revision: number;
  updating: boolean;
  view: CloudView;
  onSelectView: (view: CloudView) => void;
  showPlate: boolean;
  onShowPlate: (show: boolean) => void;
  wireframe: boolean;
  onWireframe: (show: boolean) => void;
  topDown: boolean;
  onToggleTopDown: () => void;
  resetCamera: number;
  onResetCamera: () => void;
}

export function CloudPreviewPane({ parameters, kit, revision, updating, view, onSelectView, showPlate, onShowPlate, wireframe, onWireframe, topDown, onToggleTopDown, resetCamera, onResetCamera }: CloudPreviewPaneProps) {
  const p = kit?.parameters ?? parameters;
  const { kind } = parameters;
  const isSun = kind === 'sun';
  const title = WALL_LAMP_KIND_INFO[kind].title;
  const noun = kind;
  const assembly = isAssemblyView(view);
  const derived = core.cloud.derived(p);
  const mesh = kit?.views[view] ?? null;
  const style = viewStyle(view, parameters, kit);

  return (
    <div className="cloud-preview">
      <div className="cloud-preview__header">
        <Select
          className="cloud-preview__picker"
          label={`${title} view`}
          labelHidden
          options={CLOUD_VIEWS.map((value) => ({ value, label: CLOUD_VIEW_TITLE[value] }))}
          value={view}
          onChange={onSelectView}
          testId={`${noun}PreviewPart`}
        />
        <span className="cloud-preview__name">{derived.displayName}</span>
        <span className="cloud-preview__status" aria-live="polite">
          {updating ? 'Updating…' : 'Live preview'}
        </span>
      </div>

      <div className="cloud-preview__stage">
        <div className="cloud-preview__canvas">
          <Stage
            mesh={mesh}
            geometryKey={`${revision}:${view}`}
            color={style.color}
            showPlate={showPlate && !assembly}
            wireframe={wireframe}
            resetCamera={resetCamera}
            cutaway={false}
            inspectOpening={false}
            neckDiameter={0}
            compactObject
            faceColors={mesh?.faceColors}
            detailColor={style.detailColor}
            accentColor={SEAL_COLOR}
            hardwareColor={CLAMP_COLOR}
            minimumScale={style.minimumScale}
            topDown={topDown}
            objectName={`${noun} lamp`}
            sharpEdges
            smoothAngle={p.surface === 'sculpted' ? Math.PI / 5 : 0}
          />
        </div>
        {kit && (
          <span className="cloud-preview__caption" data-testid={`${noun}PreviewCaption`}>
            {viewCaption(view, kit)}
          </span>
        )}
        <div className="cloud-preview__controls">
          <span className="cloud-preview__hint">Drag to orbit  ·  Scroll to zoom</span>
          <Button variant="plain" className="cloud-stage-button" testId={`${noun}FaceView`} onClick={onToggleTopDown}>
            <Icon name="viewfinder" size={12} />
            {topDown ? 'Angled view' : 'Face view'}
          </Button>
          <Button variant="plain" className="cloud-stage-button cloud-stage-button--icon" title={`Reset ${noun} camera`} aria-label={`Reset ${noun} camera`} onClick={onResetCamera}>
            <Icon name="arrow.counterclockwise" size={13} />
          </Button>
        </div>
      </div>

      <div className="cloud-preview__toggles">
        <span className={derived.fitsP2S ? 'cloud-fit' : 'cloud-fit cloud-fit--over'} data-testid={`${noun}Fit`}>
          {derived.fitsP2S ? 'All pieces fit P2S + 8 mm brim' : `Exceeds P2S bed · reduce ${noun} width`}
        </span>
        {!assembly && (
          <Checkbox checked={showPlate} onChange={onShowPlate} testId={`${noun}BuildPlate`}>
            Build plate
          </Checkbox>
        )}
        <Checkbox checked={wireframe} onChange={onWireframe} testId={`${noun}Wireframe`}>
          Wireframe
        </Checkbox>
      </div>

      <MetricRow testId={`${noun}Metrics`}>
        <Metric title={`${title.toUpperCase()} SIZE`} value={`${number(p.width)} × ${number(derived.height)}`} unit="mm" />
        <Metric title="ASSEMBLED DEPTH" value={number(derived.totalDepth)} unit="mm" />
        <Metric title={isSun ? 'DIFFUSER' : 'WHITE FACE'} value={number(p.diffuserThickness)} unit="mm" />
      </MetricRow>

      <div className="cloud-preview__closing">
        <p className="cloud-closing-title">{isSun ? 'A warm sun to sit beside your clouds.' : 'Light through the cloud. Openings hidden behind it.'}</p>
        <p className="cloud-text">The nail sits in a blind pocket with a 3 mm solid cap. Each cable leaves through the outer wall, through a flexible seal that fills the opening. Check the printed assembly in a dark room before mounting.</p>
        <p className="cloud-note">Prototype · clip fit, mounting strength, opacity and LED heat need a physical check.</p>
      </div>
    </div>
  );
}
