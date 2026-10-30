import { useEffect, useRef } from 'react';
import BalloonEditor from '../editors/balloon';
import { startExport } from '../io';
import { DropZone } from '../open/DropZone';
import { ImportReviewDialog } from '../open/ImportReviewDialog';
import { useAppStore, useBalloonStore, useImportStore } from '../stores';
import { AlertDialog, Button, useGlobalShortcuts } from '../ui';
import type { PartKey } from '../worker/protocol';
import { Header } from './Header';
import { PartPlaceholder } from './PartPlaceholder';

// ContentView and the scene around it (BalloonStudioApp.swift:211-351). The `importRevision`
// effect (:342-344) lives in the app store.

function PartEditor({ part }: { part: PartKey }) {
  switch (part) {
    case 'balloon':
      return <BalloonEditor />;
    // WP-U6/U7/U8: editors are wired here by the integrator
    case 'basket':
      return <PartPlaceholder part="basket" />;
    case 'ring':
      return <PartPlaceholder part="ring" />;
    case 'cloud':
      return <PartPlaceholder part="cloud" />;
    case 'sun':
      return <PartPlaceholder part="sun" />;
    case 'figure':
      return <PartPlaceholder part="figure" />;
    case 'clip':
      return <PartPlaceholder part="clip" />;
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

  const chooseFile = () => {
    if (useImportStore.getState().chooseFile()) fileInput.current?.click();
  };

  useGlobalShortcuts({
    onExport: () => void startExport(useAppStore.getState().part),
    onOpen: chooseFile,
    onReset: () => useAppStore.getState().resetCurrentPart(),
  });

  return (
    <div className="app">
      <Header onOpen={chooseFile} />
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
          if (file) void useAppStore.getState().openFile(file);
        }}
      />
      <DropZone />
      <ImportReviewDialog />
      <AlertDialog open={exportError !== null} title="Export failed" message={exportError ?? ''} onDismiss={() => useBalloonStore.getState().setError(null)} />
      <AlertDialog open={importError !== null} title="Couldn’t open file" message={importError ?? ''} onDismiss={() => useImportStore.getState().setError(null)} />
    </div>
  );
}
