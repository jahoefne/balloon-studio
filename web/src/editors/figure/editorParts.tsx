// The pieces FigureEditor.swift and CableClipEditor.swift write out twice: the sidebar's small
// texts, the export footer, the stage with its badge and buttons, the color swatches. The clip
// editor imports them from here.

import type { ReactNode } from 'react';
import { calibrated } from '../../preview/colors';
import type { ExportedFile } from '../../stores/createPartStore';
import { Button, Icon, modKeyLabel, type SymbolName } from '../../ui';
import './editor.css';

/** `Text(...).font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)` */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="fc-caption">{children}</p>;
}

export interface NoteLabelProps {
  icon: SymbolName;
  tone: 'warning' | 'secondary' | 'accent';
  /** `.font(.system(size:10, weight:.medium))` */
  medium?: boolean | undefined;
  testId?: string | undefined;
  children: ReactNode;
}

/** `Label(text, systemImage:icon).font(.system(size:10)).foregroundStyle(tone)` */
export function NoteLabel({ icon, tone, medium, testId, children }: NoteLabelProps) {
  return (
    <p className={`fc-note${medium ? ' fc-note--medium' : ''}`} data-tone={tone} data-testid={testId}>
      <Icon name={icon} size={11} className="fc-note__icon" />
      <span>{children}</span>
    </p>
  );
}

export interface ExportButtonProps {
  label: string;
  preparingLabel: string;
  exporting: boolean;
  /** `c.problem != nil`: the button turns gray and stays disabled. */
  blocked?: boolean | undefined;
  testId: string;
  onClick: () => void;
}

export function ExportButton({ label, preparingLabel, exporting, blocked = false, testId, onClick }: ExportButtonProps) {
  return (
    <Button
      variant="plain"
      className={`fc-export${blocked ? ' fc-export--blocked' : ''}`}
      disabled={exporting || blocked}
      testId={testId}
      onClick={onClick}
    >
      {exporting ? <span className="fc-spinner" aria-hidden /> : <Icon name="square.and.arrow.up" />}
      <span className="fc-export__label">{exporting ? preparingLabel : label}</span>
      <span className="fc-export__shortcut">{modKeyLabel()}E</span>
    </Button>
  );
}

/**
 * The line under the export buttons. The Mac's "Saved · Show in Finder" has no web counterpart,
 * so it names the file (docs/plan.md, Abschnitt 6: prefix `Saved`).
 */
export function FooterStatus({ exported, idle }: { exported: ExportedFile | null; idle: string }) {
  if (!exported) return <p className="fc-footer__idle">{idle}</p>;
  return (
    <p className="fc-footer__saved" role="status">
      <Icon name="checkmark.circle.fill" size={12} />
      <span>
        {exported.mode === 'saved' ? 'Saved' : 'Downloaded'} · {exported.filename}
      </span>
    </p>
  );
}

export interface StageFrameProps {
  badge: string;
  badgeIcon: SymbolName;
  viewLabel: string;
  onView: () => void;
  resetHelp: string;
  onReset: () => void;
  /** The `Stage`. */
  children: ReactNode;
}

/** The `ZStack` around `BalloonPreview`: rounded stage, capsule badge, hint and camera buttons. */
export function StageFrame({ badge, badgeIcon, viewLabel, onView, resetHelp, onReset, children }: StageFrameProps) {
  return (
    <div className="fc-stage">
      <div className="fc-stage__host">{children}</div>
      <p className="fc-stage__badge" data-testid="stageBadge">
        <Icon name={badgeIcon} size={12} />
        <span>{badge}</span>
      </p>
      <div className="fc-stage__bottom">
        <span className="fc-stage__hint">{'Drag to orbit  ·  Scroll to zoom'}</span>
        <span className="fc-stage__spacer" />
        <button type="button" className="fc-stage__button" onClick={onView}>
          <Icon name="viewfinder" size={12} />
          {viewLabel}
        </button>
        <button type="button" className="fc-stage__button fc-stage__button--icon" title={resetHelp} aria-label={resetHelp} onClick={onReset}>
          <Icon name="arrow.counterclockwise" size={13} />
        </button>
      </div>
    </div>
  );
}

export interface SwatchOption {
  /** `NSColor(calibratedRed:green:blue:alpha:1)` */
  color: readonly [number, number, number];
  help: string;
  label: string;
}

export interface SwatchesProps {
  options: readonly SwatchOption[];
  selected: number;
  onSelect: (index: number) => void;
  /** The clip draws a faint ring around unselected swatches, because one of them is near-white. */
  ringed?: boolean | undefined;
}

export function Swatches({ options, selected, onSelect, ringed = false }: SwatchesProps) {
  return options.map((option, i) => {
    const [r, g, b] = option.color;
    return (
      <button
        key={option.label}
        type="button"
        className={`fc-swatch${ringed ? ' fc-swatch--ringed' : ''}`}
        title={option.help}
        aria-label={option.label}
        aria-pressed={selected === i}
        onClick={() => onSelect(i)}
      >
        <span className="fc-swatch__fill" style={{ background: `rgb(${r * 255} ${g * 255} ${b * 255})` }} />
      </button>
    );
  });
}

/** The swatch data for colors the Swift source lists as calibrated components. */
export const swatchColor = (r: number, g: number, b: number) => calibrated(r, g, b);

/** The range of a core `Range` as `ParameterControl` takes it. */
export const rangeOf = (range: { readonly lower: number; readonly upper: number }): readonly [number, number] => [range.lower, range.upper];
