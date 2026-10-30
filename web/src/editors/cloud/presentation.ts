// The texts and preview settings of CloudEditor.swift that depend on the lamp, kept apart from
// the components: export panel strings (:94-100), notes (:457-486), caption (:418), colors (:137-144, 410-416).

import { core } from '#core/parameters';
import { CABLE_SIDE_TITLE, CABLE_SIDES, WALL_LAMP_KIND_INFO, type CableSide, type CloudParameters, type CloudPreview, type CloudView } from '../../core/types';
import { calibrated, type PreviewColor } from '../../preview/colors';
import { number01 as number } from '../../ui/format';

/** `CloudEditor.number(_:)`: up to one fraction digit. */
export { number };

/** `CloudEditor.list(_:)` */
export const list = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;

/** `2 + outlets + 2·clamps + insert` (:98-99), from the parameters alone. Equals `kit.printedParts`. */
export const exportPartCount = (p: CloudParameters): number => {
  const clamps = core.cloud.cableConfigurations(p).filter((configuration) => core.cloud.clampFits(configuration)).length;
  return 2 + core.cloud.derived(p).cableSides.length + 2 * clamps + (p.nailInsert && core.cloud.nailInsert(p) !== null ? 1 : 0);
};

/** The strings of the save panel (:94-100). WP-U9 shows them in its dialog. */
export interface CloudExportRequest {
  snapshot: CloudParameters;
  title: string;
  prompt: string;
  suggestedName: string;
  message: string;
}

export const exportRequest = (snapshot: CloudParameters): CloudExportRequest => {
  const { fitsP2S, filename } = core.cloud.derived(snapshot);
  return {
    snapshot,
    title: `Export ${WALL_LAMP_KIND_INFO[snapshot.kind].title} Lamp Kit`,
    prompt: 'Export Kit',
    suggestedName: filename,
    message: `${exportPartCount(snapshot)} print-ready STLs, a full-size LED placement plan, cut list and assembly notes.${fitsP2S ? '' : ' This width exceeds the P2S bed with a brim.'}`,
  };
};

/** Why this lamp gets no clamp, and what would give it one (:457-471). */
export const noClampNote = (p: CloudParameters, cablesWithoutClamp: readonly CableSide[]): string => {
  if (core.cloud.derived(p).cableSides.length > 1) {
    const sides = cablesWithoutClamp.map((side) => CABLE_SIDE_TITLE[side]);
    return `No room for a clamp at ${list(sides)}. ${sides.length === 1 ? 'This outlet keeps its seal; secure its lead' : 'These outlets keep their seals; secure their leads'} outside the lamp.`;
  }
  const minimumWidth = core.cloud.clampMinimumWidth(p);
  const wider = minimumWidth === null ? null : `a width of ${number(minimumWidth)} mm or more`;
  const exits = CABLE_SIDES.filter((side) => core.cloud.clampFits(core.cloud.normalize({ ...p, cableSide: side })));
  const other = exits.length === 0 ? null : `the cable exit at the ${exits.length > 1 ? `${exits.slice(0, -1).join(', ')} or ` : ''}${exits[exits.length - 1]!}`;
  const choices = [wider, other].filter((choice) => choice !== null).join(', or ');
  return `No room for the clamp behind this outlet: the nail pocket or the wall is too close. The kit comes without it.${choices === '' ? '' : ` It fits with ${choices}.`}`;
};

/** Where the chosen exit is on this silhouette (:473-486). */
export const cableExitNote = (p: CloudParameters): string => {
  const sides = core.cloud.derived(p).cableSides;
  if (sides.length > 1) {
    return `Cable exits: ${list(sides.map((side) => CABLE_SIDE_TITLE[side]))}. Left and right are as you face the lamp. The back sits flat on the wall.`;
  }
  const isSun = p.kind === 'sun';
  const place = {
    right: `Left and right are as you face the lamp${isSun ? ': the cable leaves between two rays, just below the horizontal one' : ': the cable leaves at the widest point'}.`,
    left: `Left and right are as you face the lamp${isSun ? ': the cable leaves between two rays, just above the horizontal one' : ': the cable leaves at the widest point'}.`,
    top: isSun ? 'The cable leaves upwards, between two rays, just right of the vertical one.' : 'The cable leaves at the highest point of the cloud.',
    bottom: isSun ? 'The cable leaves downwards, between two rays, just left of the vertical one.' : 'The cable leaves straight down, in the middle of the flat base.',
  }[p.cableSide];
  return `${place} The recessed keyhole has a solid cap, and the back sits flat on the wall.`;
};

/** The caption on the stage (:418). */
export const viewCaption = (view: CloudView, kit: CloudPreview): string => {
  const p = kit.parameters;
  const sculpted = p.surface === 'sculpted';
  switch (view) {
    case 'exploded':
      return `${kit.printedParts} printed parts · four hidden clips${kit.clampCount === 0 ? '' : ` · ${2 * kit.clampCount} screws`}`;
    case 'rear':
      return `Blind keyhole · closed floor · cable: ${core.cloud.derived(p).cableSides.map((side) => CABLE_SIDE_TITLE[side]).join(' + ')}${kit.hasInsertMesh ? ' · blue: slot insert' : ''}`;
    case 'insert':
      return kit.hasInsertMesh ? 'Flat face on the bed, fingers up · print solid' : 'No slot insert in this kit · showing the wall side';
    case 'back':
      return `Green: LED guides · orange: seals${kit.clampCount === 0 ? '' : ' · blue: clamps'}`;
    case 'seal':
      return 'Black TPU · flat end down, nozzle up · no supports';
    case 'clamp':
      return kit.clampCount === 0 ? 'No strain relief in this lamp · showing the seals' : `Bar on its side, anvil flat · ${2 * kit.clampCount} screws M3 × 10`;
    case 'front':
      return sculpted ? 'Curved face up · clips down · supports required' : 'Diffuser · flat face on the bed';
    case 'assembled':
      return `${sculpted ? 'Sculpted' : p.kind === 'sun' ? 'Warm' : 'White'} diffuser · opaque backing`;
  }
};

// Print the seal in black. The preview shows it in color, to find it.
export const SEAL_COLOR = calibrated(0.93, 0.45, 0.2);
// Bar and anvil of the strain relief. Any color prints.
export const CLAMP_COLOR = calibrated(0.25, 0.58, 0.8);
const GUIDE_COLOR = calibrated(0.35, 0.65, 0.49);
const white = (w: number): PreviewColor => [w, w, w];

// A softer white keeps the shading that shows the puffs of a sculpted cloud.
const diffuserColor = (p: CloudParameters): PreviewColor =>
  p.kind === 'sun' ? calibrated(1, 0.77, 0.25) : white(p.surface === 'sculpted' ? 0.8 : 0.96);

export const isAssemblyView = (view: CloudView): boolean => view === 'assembled' || view === 'exploded';

/** The Stage settings that follow the view (:410-414). `p` is the model's parameters, `kit` the finished preview. */
export const viewStyle = (view: CloudView, p: CloudParameters, kit: CloudPreview | null) => {
  const clampCount = kit?.clampCount ?? 0;
  const hasInsertMesh = kit?.hasInsertMesh ?? false;
  const color =
    view === 'front'
      ? diffuserColor(p)
      : view === 'seal'
        ? white(0.2)
        : (view === 'clamp' && clampCount > 0) || (view === 'insert' && hasInsertMesh)
          ? CLAMP_COLOR
          : white(0.36);
  return {
    color,
    detailColor: isAssemblyView(view) ? diffuserColor(p) : GUIDE_COLOR,
    minimumScale: view === 'seal' ? 9 : view === 'insert' && hasInsertMesh ? 12 : view === 'clamp' ? 16 : 32,
  };
};

