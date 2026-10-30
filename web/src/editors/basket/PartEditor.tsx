// What BasketEditor.swift and RingEditor.swift both repeat: the 312 pt sidebar with its scrolling
// body and export footer, the preview column, and the overlays on the stage. The ring imports it
// from here because WP-U6 owns only these two folders.

import { useEffect, useRef, type ReactNode } from 'react';
import type { ExportedFile } from '../../stores';
import { Icon, modKeyLabel, type SymbolName } from '../../ui';
import './partEditor.css';

/** SwiftUI's `.onChange(of:)`: runs when `value` differs from the last render, not on mount. */
export function useOnChange<T>(value: T, action: (previous: T) => void): void {
  const last = useRef(value);
  useEffect(() => {
    const previous = last.current;
    if (Object.is(previous, value)) return;
    last.current = value;
    action(previous);
  });
}

export interface PartEditorProps {
  sidebar: ReactNode;
  footer: ReactNode;
  /** The preview column. */
  children: ReactNode;
}

/** `HStack { sidebar.frame(width:312) · Divider · preview.padding(22) }` */
export function PartEditor({ sidebar, footer, children }: PartEditorProps) {
  return (
    <div className="part-editor">
      <div className="part-editor__sidebar">
        <div className="part-editor__scroll">{sidebar}</div>
        <div className="part-editor__footer">{footer}</div>
      </div>
      <div className="part-editor__preview">{children}</div>
    </div>
  );
}

export interface ExportFooterProps {
  testId: string;
  label: string;
  preparingLabel: string;
  /** "Basket" in "Basket saved · <filename>" (plan §6). */
  savedPrefix: string;
  caption: string;
  exporting: boolean;
  exported: ExportedFile | null;
  onExport: () => void;
}

export function ExportFooter({ testId, label, preparingLabel, savedPrefix, caption, exporting, exported, onExport }: ExportFooterProps) {
  return (
    <>
      <button type="button" className="part-export" data-testid={testId} disabled={exporting} onClick={onExport}>
        {exporting ? <span className="part-export__spinner" aria-hidden /> : <Icon name="square.and.arrow.up" size={14} />}
        <span className="part-export__label">{exporting ? preparingLabel : label}</span>
        <span className="part-export__shortcut">{modKeyLabel()}E</span>
      </button>
      <div className="part-editor__status" aria-live="polite">
        {exported ? (
          <p className="part-saved" title={exported.filename}>
            <Icon name="checkmark.circle.fill" size={12} />
            <span className="part-saved__text">
              {savedPrefix} {exported.mode} · {exported.filename}
            </span>
          </p>
        ) : (
          <p className="part-caption">{caption}</p>
        )}
      </div>
    </>
  );
}

/** "Updating…" or "Live preview" at the right of the preview's title row. */
export function PreviewStatus({ updating }: { updating: boolean }) {
  return (
    <span className="part-preview-status" aria-live="polite">
      {updating ? 'Updating…' : 'Live preview'}
    </span>
  );
}

export interface StageFrameProps {
  minHeight: number;
  /** The `Stage`, which fills this frame. */
  stage: ReactNode;
  badge: ReactNode;
  badgeIcon?: SymbolName | undefined;
  /** The buttons at the bottom right. */
  controls: ReactNode;
}

/** The ZStack around `BalloonPreview`: rounded stage, capsule top left, hint and buttons at the bottom. */
export function StageFrame({ minHeight, stage, badge, badgeIcon, controls }: StageFrameProps) {
  return (
    <div className="part-stage" style={{ minHeight }}>
      <div className="part-stage__canvas">{stage}</div>
      <div className="part-stage__badge">
        {badgeIcon && <Icon name={badgeIcon} size={12} />}
        {badge}
      </div>
      <div className="part-stage__bar">
        <span className="part-stage__hint">Drag to orbit  ·  Scroll to zoom</span>
        <span className="part-stage__spacer" />
        {controls}
      </div>
    </div>
  );
}

export interface StageIconButtonProps {
  title: string;
  onClick: () => void;
}

/** The 29 pt reset button on the stage. */
export function StageResetButton({ title, onClick }: StageIconButtonProps) {
  return (
    <button type="button" className="part-stage__button part-stage__button--icon" title={title} aria-label={title} onClick={onClick}>
      <Icon name="arrow.counterclockwise" size={14} />
    </button>
  );
}
