import { useEffect, useId, useRef, useState } from 'react';
import { Button, Dialog } from '../ui';
import { cancelExport, confirmExport, useExportPanel } from './exportFlow';
import { fileNameFromField } from './exportTable';
import './io.css';

// The web's NSSavePanel: the Mac's title, message, name field and prompt (plan §6). Choosing
// where the file goes is the system picker's job, or the browser's on a plain download.

export function ExportDialog() {
  const pending = useExportPanel((state) => state.pending);
  const panel = pending?.panel ?? null;
  const titleId = useId();
  const messageId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  // Each panel starts from its own suggestion.
  const [shown, setShown] = useState(panel);
  if (panel !== shown) {
    setShown(panel);
    if (panel !== null) setName(panel.suggestedName);
  }

  useEffect(() => {
    if (panel === null) return;
    // NSSavePanel selects the name without its extension.
    const suffix = `.${panel.extension}`;
    const { suggestedName } = panel;
    input.current?.setSelectionRange(0, suggestedName.endsWith(suffix) ? suggestedName.length - suffix.length : suggestedName.length);
  }, [panel]);

  return (
    <Dialog open={panel !== null} onCancel={cancelExport} onDefault={() => void confirmExport(name)} labelledBy={titleId} describedBy={messageId} className="io-export" testId="exportDialog">
      {panel !== null && (
        <>
          <h2 id={titleId} className="io-export__title">
            {panel.title}
          </h2>
          <p id={messageId} className="io-export__message">
            {panel.message}
          </p>
          <label className="io-export__name">
            <span>Save as:</span>
            <input
              ref={input}
              type="text"
              value={name}
              spellCheck={false}
              autoComplete="off"
              data-autofocus
              data-testid="exportFilename"
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>
          <div className="io-export__actions">
            <Button onClick={cancelExport}>Cancel</Button>
            <Button variant="prominent" disabled={fileNameFromField(name, panel.extension) === null} testId="exportConfirm" onClick={() => void confirmExport(name)}>
              {panel.prompt}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
