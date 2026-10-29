import { useId, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import './primitives.css';

// SwiftUI `.sheet` with a fixed frame, a title row with "Done" (`.cancelAction`, so Esc
// closes it) and a scrolling body: the ring guide (RingEditor.swift:363-392, 640×620) and
// the lamp guide (CloudEditor.swift:164-173, 700×650). Narrow windows shrink the sheet.

export interface SheetProps {
  open: boolean;
  title: string;
  onDone: () => void;
  width: number;
  height: number;
  children: ReactNode;
  testId?: string | undefined;
}

export function Sheet({ open, title, onDone, width, height, children, testId }: SheetProps) {
  const titleId = useId();
  return (
    <Dialog
      open={open}
      className="ui-sheet"
      style={{ width: `min(${width}px, calc(100vw - 32px))`, height: `min(${height}px, calc(100dvh - 32px))` }}
      labelledBy={titleId}
      onCancel={onDone}
      testId={testId}
    >
      <div className="ui-sheet__header">
        <h2 id={titleId} className="ui-sheet__title">
          {title}
        </h2>
        <Button onClick={onDone}>Done</Button>
      </div>
      {/* Focused on open so arrow keys and Page Down scroll the guide right away. */}
      <div className="ui-sheet__body" tabIndex={0} data-autofocus>
        {children}
      </div>
    </Dialog>
  );
}
