import { useEffect, useState } from 'react';
import { openDroppedFile } from '../io/openFile';
import { Icon } from '../ui';
import './open.css';

// The web's stand-in for NSOpenPanel's message and the Mac's `onOpenURL`: a file dragged over the
// window shows the panel's title and message (STLImportView.swift:23,28); dropping opens it.

export const OPEN_PANEL_TITLE = 'Open Balloon or Lamp Settings';
export const OPEN_PANEL_MESSAGE = 'Choose a balloon STL, cloud-settings.json, or sun-settings.json from an exported lamp kit.';

const carriesFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') ?? false;

export function DropZone() {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // dragenter and dragleave fire for every child crossed, in that order.
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      // Otherwise the browser navigates to the file.
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) openDroppedFile(file);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!dragging) return null;
  return (
    <div className="open-drop" data-testid="dropZone">
      <div className="open-drop__card">
        <Icon name="folder" size={24} />
        <p className="open-drop__title">{OPEN_PANEL_TITLE}</p>
        <p className="open-drop__message">{OPEN_PANEL_MESSAGE}</p>
      </div>
    </div>
  );
}
