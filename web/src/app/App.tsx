import { useEffect, useRef } from 'react';
import BalloonEditor from '../editors/balloon';
import BasketEditor from '../editors/basket';
import CableClipEditor from '../editors/clip';
import CloudEditor from '../editors/cloud';
import FigureEditor from '../editors/figure';
import RingEditor from '../editors/ring';
import { chooseFile, ExportDialog, openFile, presentExport, startExport } from '../io';
import { DropZone } from '../open/DropZone';
import { ImportReviewDialog } from '../open/ImportReviewDialog';
import { useAppStore, useBalloonStore, useImportStore } from '../stores';
import { AlertDialog, Button, useGlobalShortcuts } from '../ui';
import type { PartKey } from '../worker/protocol';
import { Header } from './Header';

// ContentView and the scene around it (BalloonStudioApp.swift:211-351). The `importRevision`
// effect (:342-344) lives in the app store.

function PartEditor({ part }: { part: PartKey }) {
  switch (part) {
    case 'balloon':
      return <BalloonEditor />;
    case 'basket':
      return <BasketEditor />;
    case 'ring':
      return <RingEditor />;
    case 'cloud':
      return <CloudEditor kind="cloud" onExport={(request) => void presentExport('cloud', request.snapshot)} />;
    case 'sun':
      return <CloudEditor kind="sun" onExport={(request) => void presentExport('sun', request.snapshot)} />;
    case 'figure':
      return <FigureEditor onExport={(request) => void presentExport('figure', request)} />;
    case 'clip':
      return <CableClipEditor onExport={(parameters) => void presentExport('clip', parameters)} />;
  }
}

export function App() {
  const part = useAppStore((state) => state.part);
  const storageWarning = useAppStore((state) => state.storageWarning);
  const exportError = useBalloonStore((state) => state.error);
  const importError = useImportStore((state) => state.error);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    useAppStore.getState().start();
  }, []);

  const showOpenPanel = () => chooseFile(() => fileInput.current?.click());

  useGlobalShortcuts({
    onExport: () => void startExport(useAppStore.getState().part),
    onOpen: showOpenPanel,
    onReset: () => useAppStore.getState().resetCurrentPart(),
  });

  return (
    <div className="app">
      <Header onOpen={showOpenPanel} />
      <main className="app-content">
        <PartEditor part={part} />
      </main>
      {storageWarning !== null && (
        <div className="app-toast" role="status">
          {storageWarning}
          <Button variant="plain" className="app-toast__dismiss" onClick={() => useAppStore.getState().setStorageWarning(null)}>
            OK
          </Button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".stl,.json"
        hidden
        data-testid="openFileInput"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Choosing the same file again must fire `change` again.
          event.currentTarget.value = '';
          if (file) void openFile(file);
        }}
      />
      <DropZone />
      <ImportReviewDialog />
      <ExportDialog />
      <AlertDialog open={exportError !== null} title="Export failed" message={exportError ?? ''} onDismiss={() => useBalloonStore.getState().setError(null)} />
      <AlertDialog open={importError !== null} title="Couldn’t open file" message={importError ?? ''} onDismiss={() => useImportStore.getState().setError(null)} />
    </div>
  );
}
