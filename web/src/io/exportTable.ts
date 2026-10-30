// What each Mac `export()` puts in its NSSavePanel, per part and variant, and what its footer
// says. The strings are Swift's: BalloonStudioApp.swift:162-175 + :475-486, BasketEditor.swift:61-66
// + :171-179, RingEditor.swift:100-107 + :264-272, CloudEditor.swift:93-100 + :310-315,
// FigureEditor.swift:50-57 + :169-182, CableClipEditor.swift:50-55 + :176-185. File names come
// from the parameter API; the cloud and sun panel strings live with their editor (`exportRequest`).

import { core } from '#core/parameters';
import type { BalloonSnapshot, BasketParameters, CableClipParameters, CloudParameters, ExportResult, RingParameters } from '../core/types';
import { exportRequest } from '../editors/cloud/presentation';
import type { ExportedFile } from '../stores';
import type { ExportInputs, PartKey } from '../worker/protocol';

export interface ExportEntry<S> {
  title: string;
  prompt: string;
  /** Extension included. */
  suggestedName(snapshot: S): string;
  extension: 'stl' | '3mf' | 'zip';
  mime: ExportResult['mime'];
  message(snapshot: S): string;
  footerLabel: string;
  preparingLabel: string;
  savedPrefix: string;
}

type FigureRequest = ExportInputs['figure'];

const STL = { extension: 'stl', mime: 'model/stl' } as const;
const ZIP = { extension: 'zip', mime: 'application/zip' } as const;

const lampEntry = (title: string): ExportEntry<CloudParameters> => ({
  title: `Export ${title} Lamp Kit`,
  prompt: 'Export Kit',
  suggestedName: (p) => exportRequest(p).suggestedName,
  ...ZIP,
  message: (p) => exportRequest(p).message,
  footerLabel: `Export ${title} Kit…`,
  preparingLabel: 'Exporting…',
  savedPrefix: title,
});

export const EXPORT_TABLE = {
  balloonSTL: {
    title: 'Export Balloon STL',
    prompt: 'Export STL',
    suggestedName: (s) => core.balloon.exportFilename(s),
    ...STL,
    message: (s) =>
      s.parameters.hollow
        ? 'Hollow shell with an open neck for LEDs. Millimetres; use 0% infill and standard printing mode.'
        : 'A closed, printable envelope in millimetres. Set walls and infill in your slicer.',
    footerLabel: 'Export STL…',
    preparingLabel: 'Preparing STL…',
    savedPrefix: 'File',
  } satisfies ExportEntry<BalloonSnapshot>,
  balloon3MF: {
    title: 'Export Balloon 3MF',
    prompt: 'Export 3MF',
    suggestedName: (s) => core.balloon.exportFilename(s),
    extension: '3mf',
    mime: 'model/3mf',
    message: () => 'Two filament colors with Bambu Studio paint assignments. Select your P2S profile and map colors after opening.',
    footerLabel: 'Export 3MF…',
    preparingLabel: 'Preparing 3MF…',
    savedPrefix: 'File',
  } satisfies ExportEntry<BalloonSnapshot>,
  basket: {
    title: 'Export Basket STL',
    prompt: 'Export Basket',
    suggestedName: (p) => core.basket.filename(p),
    ...STL,
    message: () => 'A separate open-top basket with four cord holes. Millimetres; print flat base down.',
    footerLabel: 'Export Basket STL…',
    preparingLabel: 'Preparing basket…',
    savedPrefix: 'Basket',
  } satisfies ExportEntry<BasketParameters>,
  ringSolid: {
    title: 'Export Mobile Ring STL',
    prompt: 'Export Ring',
    suggestedName: (p) => core.ring.filename(p),
    ...STL,
    message: (p) => {
      const { fitsP2S } = core.ring.derived(p);
      return p.reflectedLED
        ? `One continuous ring with three ceiling holes, three balloon holes and an upright LED mount. Print flat, trough facing up.${fitsP2S ? '' : ' This size exceeds the P2S bed; reduce diameter in the app for a test print.'}`
        : `One ring for three balloons, with six cord holes and a top LED channel. Print flat, channel facing up.${fitsP2S ? '' : ' This size exceeds the P2S bed.'}`;
    },
    footerLabel: 'Export Ring STL…',
    preparingLabel: 'Preparing ring…',
    savedPrefix: 'Ring',
  } satisfies ExportEntry<RingParameters>,
  ringKit: {
    title: 'Export Ring Kit',
    prompt: 'Export Kit',
    suggestedName: (p) => core.ring.filename(p),
    ...ZIP,
    message: () => 'ZIP containing four STL designs, print quantities and assembly instructions. Every part fits the P2S; the assembled ring does not.',
    footerLabel: 'Export Ring Kit…',
    preparingLabel: 'Preparing ring…',
    savedPrefix: 'Ring',
  } satisfies ExportEntry<RingParameters>,
  cloud: lampEntry('Cloud'),
  sun: lampEntry('Sun'),
  figure: {
    title: 'Export Figure STL',
    prompt: 'Export Figure',
    suggestedName: ({ parameters }) => core.figure.filename(parameters),
    ...STL,
    message: () => 'One figure for the mobile, with its thread hole. Millimetres; print flat back down.',
    footerLabel: 'Export Figure STL…',
    preparingLabel: 'Preparing figure…',
    savedPrefix: 'Saved',
  } satisfies ExportEntry<FigureRequest>,
  figureSet: {
    title: 'Export Figure Set',
    prompt: 'Export Set',
    suggestedName: ({ parameters }) => core.figure.setFilename(parameters),
    ...ZIP,
    message: () => 'All seven figures at these settings, with printing and hanging notes. Millimetres; print flat back down.',
    footerLabel: 'Export all seven as a set (ZIP)…',
    preparingLabel: 'Preparing figure…',
    savedPrefix: 'Saved',
  } satisfies ExportEntry<FigureRequest>,
  clip: {
    title: 'Export Cable Clip',
    prompt: 'Export Clip',
    suggestedName: (p) => core.clip.filename(p),
    ...STL,
    message: () => 'One-piece clip in print orientation. Millimetres.',
    footerLabel: 'Export Clip STL…',
    preparingLabel: 'Preparing clip…',
    savedPrefix: 'Saved',
  } satisfies ExportEntry<CableClipParameters>,
};

export type ExportVariant = keyof typeof EXPORT_TABLE;

/** An entry with its snapshot applied: what the dialog shows. */
export type ExportPanel = Omit<ExportEntry<never>, 'suggestedName' | 'message'> & { suggestedName: string; message: string };

const panel = <S>(entry: ExportEntry<S>, snapshot: S): ExportPanel => ({ ...entry, suggestedName: entry.suggestedName(snapshot), message: entry.message(snapshot) });

/** The panel for one export, decided by its snapshot as in each Mac `export()`. */
export const exportPanel = <K extends PartKey>(part: K, input: ExportInputs[K]): ExportPanel => {
  const request = { part, input } as { [P in PartKey]: { part: P; input: ExportInputs[P] } }[PartKey];
  switch (request.part) {
    case 'balloon':
      return panel(core.balloon.exportFormat(request.input.pattern) === '3mf' ? EXPORT_TABLE.balloon3MF : EXPORT_TABLE.balloonSTL, request.input);
    case 'basket':
      return panel(EXPORT_TABLE.basket, request.input);
    case 'ring':
      return panel(request.input.segmented ? EXPORT_TABLE.ringKit : EXPORT_TABLE.ringSolid, request.input);
    case 'cloud':
      return panel(EXPORT_TABLE.cloud, request.input);
    case 'sun':
      return panel(EXPORT_TABLE.sun, request.input);
    case 'figure':
      return panel(request.input.variant === 'set' ? EXPORT_TABLE.figureSet : EXPORT_TABLE.figure, request.input);
    case 'clip':
      return panel(EXPORT_TABLE.clip, request.input);
  }
};

/**
 * The footer line once a file is out (plan §6, "Show in Finder"): "Basket saved · <file>". The
 * Mac's figure and clip footers have the bare "Saved · Show in Finder", so their prefix is the
 * whole verb: "Saved · <file>", "Downloaded · <file>".
 */
export const exportedLine = (savedPrefix: string, { mode, filename }: ExportedFile): string =>
  savedPrefix === 'Saved' ? `${mode === 'saved' ? 'Saved' : 'Downloaded'} · ${filename}` : `${savedPrefix} ${mode} · ${filename}`;

/** The name to write: the field's text without path separators, with the extension exactly once (NSSavePanel). Null when no name is left. */
export const fileNameFromField = (text: string, extension: string): string | null => {
  const name = text.trim().replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-');
  const suffix = `.${extension}`;
  const stem = name.toLowerCase().endsWith(suffix) ? name.slice(0, -suffix.length) : name;
  return stem === '' ? null : `${stem}${suffix}`;
};
