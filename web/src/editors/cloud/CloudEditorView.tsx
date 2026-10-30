import { useEffect, useState } from 'react';
import { core } from '#core/parameters';
import { WALL_LAMP_KIND_INFO, type CloudParameters, type CloudView } from '../../core/types';
import type { CloudStore } from '../../stores/cloudStore';
import { AlertDialog } from '../../ui';
import { CloudGuideSheet } from './CloudGuideSheet';
import { CloudPreviewPane } from './CloudPreviewPane';
import { CloudSidebar } from './CloudSidebar';
import type { CloudExportRequest } from './presentation';
import './cloud.css';

// `CloudEditor` (CloudEditor.swift:124-174): the view state, the effects and the two columns.

export interface CloudEditorViewProps {
  store: CloudStore;
  /** Starts the save dialog (WP-U9). Without it, the footer shows the panel's text. */
  onExport?: ((request: CloudExportRequest) => void) | undefined;
}

const cableKey = (p: CloudParameters): string => core.cloud.derived(p).cableSides.join();

export function CloudEditorView({ store, onExport }: CloudEditorViewProps) {
  const state = store();
  const { kind, bundle: kit, parameters } = state;
  const title = WALL_LAMP_KIND_INFO[kind].title;
  const [view, setView] = useState<CloudView>('exploded');
  const [showPlate, setShowPlate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [topDown, setTopDown] = useState(false);
  const [resetCamera, setResetCamera] = useState(0);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    store.getState().ensurePreview();
  }, [store]);

  // .onChange(of: selection)
  const selectView = (value: CloudView) => {
    if (value === view) return;
    setView(value);
    setResetCamera((count) => count + 1);
    setTopDown(value === 'assembled' || value === 'rear' || value === 'back');
  };

  // .onChange(of: model.kit.parameters.…): a finished preview with another shape frames again.
  const kitParameters = kit?.parameters ?? null;
  const [framedParameters, setFramedParameters] = useState(kitParameters);
  if (kitParameters !== framedParameters) {
    setFramedParameters(kitParameters);
    if (kitParameters && framedParameters) {
      const a = framedParameters, b = kitParameters;
      if (a.width !== b.width || a.style !== b.style || a.sunStyle !== b.sunStyle || a.mirrored !== b.mirrored || cableKey(a) !== cableKey(b)) {
        setResetCamera((count) => count + 1);
      }
      if (a.surface !== b.surface) {
        setTopDown(false);
        setResetCamera((count) => count + 1);
      }
    }
  }

  return (
    <div className="cloud-editor" data-testid={`${kind}Editor`}>
      <CloudSidebar
        state={state}
        onSelectView={selectView}
        onShowLEDPlacement={() => {
          selectView('back');
          setTopDown(true);
        }}
        onShowGuide={() => setShowGuide(true)}
        onExport={onExport}
      />
      <CloudPreviewPane
        parameters={parameters}
        kit={kit}
        revision={state.revision}
        updating={state.updating}
        view={view}
        onSelectView={selectView}
        showPlate={showPlate}
        onShowPlate={setShowPlate}
        wireframe={wireframe}
        onWireframe={setWireframe}
        topDown={topDown}
        onToggleTopDown={() => setTopDown((value) => !value)}
        resetCamera={resetCamera}
        onResetCamera={() => {
          setTopDown(false);
          setResetCamera((count) => count + 1);
        }}
      />
      <AlertDialog open={state.error !== null} title={`${title} export failed`} message={state.error ?? ''} onDismiss={() => state.setError(null)} testId={`${kind}ExportFailed`} />
      <CloudGuideSheet open={showGuide} title={title} instructions={kit?.instructions ?? ''} onDone={() => setShowGuide(false)} testId={`${kind}GuideSheet`} />
    </div>
  );
}
