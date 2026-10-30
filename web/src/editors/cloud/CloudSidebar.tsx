import { useMemo, useState } from 'react';
import { core } from '#core/parameters';
import { CABLE_SIDE_TITLE, CABLE_SIDES, LAMP_SURFACE_TITLE, LAMP_SURFACES, SUN_STYLE_INFO, WALL_LAMP_KIND_INFO, type CableSide, type CloudParameters, type CloudView } from '../../core/types';
import type { CloudStore } from '../../stores/cloudStore';
import { Button, Checkbox, commitEditing, Icon, modKeyLabel, ParameterControl, SectionLabel, SegmentedControl } from '../../ui';
import { cableExitNote, exportPartCount, exportRequest, noClampNote, number, type CloudExportRequest } from './presentation';
import { CloudShapeChooser, SunShapeChooser } from './ShapeChooser';

// `sidebar` of CloudEditor.swift:175-320.

type NumberKey = { [K in keyof CloudParameters]: CloudParameters[K] extends number ? K : never }[keyof CloudParameters];
const ORDINALS = ['Second', 'Third', 'Fourth'] as const;

export interface CloudSidebarProps {
  state: ReturnType<CloudStore['getState']>;
  onSelectView: (view: CloudView) => void;
  onShowLEDPlacement: () => void;
  onShowGuide: () => void;
  onExport?: ((request: CloudExportRequest) => void) | undefined;
}

export function CloudSidebar({ state, onSelectView, onShowLEDPlacement, onShowGuide, onExport }: CloudSidebarProps) {
  const { parameters: p, bundle: kit, kind } = state;
  const isSun = kind === 'sun';
  const title = WALL_LAMP_KIND_INFO[kind].title;
  const noun = kind;
  const derived = core.cloud.derived(p);
  const sides = derived.cableSides;
  const insertProblem = p.nailInsert && !kit?.nailInsert ? core.cloud.nailInsertProblem(p) : null;

  const showsNoClampNote = p.strainRelief && kit !== null && kit.clampCount < kit.cableCount;
  const cablesWithoutClamp = kit?.cablesWithoutClamp;
  const clampNote = useMemo(
    () => (showsNoClampNote && cablesWithoutClamp ? noClampNote(p, cablesWithoutClamp) : null),
    [showsNoClampNote, p, cablesWithoutClamp],
  );

  // Until WP-U9 brings the save dialog, the panel's text shows here. It holds for one set of parameters.
  const [pending, setPending] = useState<CloudExportRequest | null>(null);
  const startExport = () => {
    const snapshot = state.beginExport();
    if (snapshot === null) return;
    const request = exportRequest(snapshot);
    if (onExport) onExport(request);
    else setPending(request);
  };

  const parameter = (label: string, key: NumberKey, range: readonly [number, number], step = 1) => (
    <ParameterControl title={label} value={p[key]} onChange={(value) => state.setField(key, value)} range={range} step={step} unit="mm" />
  );

  return (
    <aside className="cloud-sidebar">
      <div className="cloud-sidebar__scroll">
        <section className="cloud-section cloud-section--intro">
          <SectionLabel>{isSun ? 'A LITTLE SUN FOR YOUR SKY' : 'A CLOUD BEHIND YOUR BALLOONS'}</SectionLabel>
          <h2 className="cloud-intro__title">{isSun ? 'A sunny spot on the wall.' : 'A little light on the wall.'}</h2>
          <p className="cloud-text">
            {isSun
              ? 'Choose your sun: an opaque LED tray and a glowing diffuser, joined by four hidden clips.'
              : 'An opaque LED tray and a white PLA diffuser, joined by four hidden clips. The balloons hang independently.'}
          </p>
        </section>

        {isSun ? (
          <SunShapeChooser sunStyle={p.sunStyle} onSelect={state.selectSunStyle} />
        ) : (
          <CloudShapeChooser parameters={p} onSelect={state.selectStyle} onMirror={state.mirror} />
        )}

        <section className="cloud-section">
          <SectionLabel>{`${title.toUpperCase()} & DIFFUSER`}</SectionLabel>
          {parameter(isSun ? 'Diameter including rays' : 'Cloud width', 'width', [derived.minimumWidth, 500])}
          {parameter('Back depth', 'depth', [16, 40])}
          <p className="cloud-note">
            {isSun
              ? '160–500 mm across the rays. The circular shape stays round; the fittings keep their actual size.'
              : 'Down to 100 mm wide and 16 mm deep. Small clouds become taller to keep room for the nail pocket and the LED rows.'}
          </p>
          {parameter(isSun ? 'Diffuser thickness' : 'White front thickness', 'diffuserThickness', [0.8, 2], 0.2)}
          <p className="cloud-note">
            {isSun
              ? 'Start with a 1.2 mm face in white or translucent yellow PLA. Preview color is illustrative; test the glow with your strip.'
              : 'Start at 1.2 mm for white PLA. A shallow back may show LED hotspots; test your filament and strip.'}
          </p>
          <p className="cloud-field-title">Front surface</p>
          <SegmentedControl
            hug
            label="Front surface"
            options={LAMP_SURFACES.map((surface) => ({ value: surface, label: LAMP_SURFACE_TITLE[surface] }))}
            value={p.surface}
            onChange={state.selectSurface}
            testId={`${noun}Surface`}
          />
          {p.surface === 'sculpted' && (
            <>
              {parameter('Surface depth', 'surfaceDepth', [2, derived.maximumSurfaceDepth], 0.5)}
              <p className="cloud-note">
                {isSun
                  ? `${SUN_STYLE_INFO[p.sunStyle].subtitle}, rising from the outline. Hollow inside for light.`
                  : 'Separate puffs, rounded from the outline up. Hollow inside for light. About 15 mm and more gives distinct puffs.'}
              </p>
              <p className="cloud-note">Print curved face up, clips down. Add supports beneath the diffuser and a brim; keep clip slots clear. See the printing guide.</p>
            </>
          )}
          {!derived.fitsP2S && (
            <>
              <p className="cloud-warning" role="alert">This width exceeds the P2S bed with an 8 mm brim.</p>
              <Button
                className="cloud-small-button"
                onClick={() => {
                  commitEditing();
                  state.setField('width', 240);
                }}
              >
                Use 240 mm for the P2S
              </Button>
            </>
          )}
        </section>

        <hr className="cloud-divider" />

        <section className="cloud-section cloud-panel">
          <h3 className="cloud-field-title cloud-field-title--icon">
            <Icon name="lightbulb" size={13} />
            Straight LED sections
          </h3>
          {parameter('Strip width', 'stripWidth', [3.5, 12], 0.5)}
          {parameter('Strip thickness incl. LEDs', 'stripThickness', [1, 6], 0.5)}
          {parameter('Distance between cut marks', 'stripCutLength', [5, 100], 0.1)}
          {parameter('LED row spacing', 'ledRowSpacing', [p.stripWidth + 4, 40], 0.5)}
          <p className="cloud-note">Aclorol USB COB: 8 mm wide, listed 16 mm cuts. Check the marks on your strip before cutting.</p>
          {kit && (
            <p className="cloud-text">
              {`${kit.ledPlan.sections.length} straight sections · ${number(kit.ledPlan.totalLength)} mm of strip. Flat adhesive mounting with room for wire links.`}
            </p>
          )}
          {kit && kit.ledPlan.sections.length === 0 && <p className="cloud-warning" role="alert">{`No complete section fits. Enlarge the ${noun} or use a strip with closer cut marks.`}</p>}
          <Button className="cloud-small-button" testId={`${noun}LEDLayout`} onClick={onShowLEDPlacement}>
            View LED placement
          </Button>
          <p className="cloud-note">{`Minimum LED-to-front gap: ${number(p.depth - 3 - p.stripThickness)} mm. Start with a 22 mm back; test row spacing behind your printed front.`}</p>
          {kit && <p className="cloud-note">{`Aclorol estimate: ${number(kit.ledPlan.nominalWatts)} W at full power. Dim to suit the lamp and check heat; larger layouts need suitable wiring and cooling.`}</p>}
        </section>

        <section className="cloud-section">
          <SectionLabel>FOUR CONCEALED CLIPS</SectionLabel>
          {parameter('Clip fit allowance', 'clipFit', [0.2, 0.5], 0.05)}
          <p className="cloud-text">1.6 mm spring tabs with tapered 2 mm roots click into an internal groove. A 12 mm overlap conceals the slots. Dry-fit before adding the LEDs.</p>
        </section>

        <hr className="cloud-divider" />

        <section className="cloud-section">
          <SectionLabel>WALL MOUNT & CABLE</SectionLabel>
          {parameter('Nail head clearance', 'nailHead', [5, 10], 0.5)}
          {parameter('Nail shaft clearance', 'nailShaft', [2, Math.min(5, p.nailHead - 2)], 0.5)}
          <Checkbox size={12} strong checked={p.nailInsert} onChange={state.setNailInsert} testId={`${noun}NailInsert`}>
            Slot insert for a small nail head
          </Checkbox>
          {p.nailInsert && (
            <>
              {parameter('Measured nail shaft', 'nailDiameter', [1, 4], 0.1)}
              {parameter('Measured nail head', 'nailHeadDiameter', [2, 8], 0.1)}
              {kit?.nailInsert ? (
                <>
                  <p className="cloud-text">
                    {`For a head that slips through the slot, also in a back you have already printed. The insert goes in through the square entry and slides up behind the lip. It narrows the slot to ${number(2 * kit.nailInsert.slotHalfWidth)} mm, and the head bears on its plate. Set the head's underside ${number(kit.nailInsert.nearestHead + 0.1)}–${number(kit.nailInsert.nearestHead + 0.4)} mm off the wall.`}
                  </p>
                  <Button className="cloud-small-button" testId={`${noun}ViewNailInsert`} onClick={() => onSelectView('insert')}>
                    View slot insert
                  </Button>
                </>
              ) : (
                insertProblem !== null && <p className="cloud-warning" role="alert">{`${insertProblem} The kit comes without it.`}</p>
              )}
            </>
          )}
          {parameter('Cable diameter', 'cableDiameter', [2, 6], 0.5)}
          <p className="cloud-field-title">Cable exit</p>
          <SegmentedControl
            hug
            label="Cable exit"
            options={CABLE_SIDES.map((side) => ({ value: side, label: CABLE_SIDE_TITLE[side] }))}
            value={p.cableSide}
            onChange={(side) => state.selectCableSide(side)}
            testId={`${noun}CableSide`}
          />
          {/* Each further outlet appears once the one before it is on.
              The fourth takes the last free side and needs no picker. */}
          {ORDINALS.slice(0, Math.min(sides.length + 1, CABLE_SIDES.length) - 1).map((ordinal, offset) => {
            const index = offset + 1;
            const free = CABLE_SIDES.filter((side) => !sides.slice(0, index).includes(side));
            return (
              <OutletRow
                key={ordinal}
                noun={noun}
                ordinal={ordinal}
                free={free}
                enabled={sides.length > index}
                side={sides[index] ?? free[0]!}
                onToggle={(enabled) => state.setCableOutlet(index, enabled)}
                onSelect={(side) => state.selectCableSide(side, index)}
              />
            );
          })}
          <p className="cloud-text">{cableExitNote(p)}</p>
          <h3 className="cloud-seal-title">
            <Icon name="circle.lefthalf.filled" size={12} />
            Flexible cable seal
          </h3>
          <p className="cloud-text">Each outlet has a seal printed in black TPU. It grips the cable and fills the window in the wall. Measure the cable: every outlet uses the diameter set here.</p>
          <Button className="cloud-small-button" testId={`${noun}CableSeal`} onClick={() => onSelectView('seal')}>
            View cable seal
          </Button>
          <Checkbox size={12} strong checked={p.strainRelief} onChange={state.setStrainRelief} testId={`${noun}StrainRelief`}>
            Screwed strain relief
          </Checkbox>
          {p.strainRelief && kit !== null && kit.clampCount > 0 && (
            <>
              <p className="cloud-text">Each clamp has two posts behind its seal, an anvil under the cable and a bar across it, held by two M3 × 10 screws. Ribs grip the jacket. The posts stop the bar, so the cable is squeezed by a set amount.</p>
              <Button className="cloud-small-button" testId={`${noun}CableClamp`} onClick={() => onSelectView('clamp')}>
                View cable clamp
              </Button>
            </>
          )}
          {clampNote !== null && <p className="cloud-warning" role="alert">{clampNote}</p>}
        </section>

        <Button className="cloud-guide-button" testId={`${noun}AssemblyGuide`} onClick={onShowGuide}>
          Printing & assembly guide
        </Button>
      </div>

      <footer className="cloud-footer">
        <Button variant="prominent" className="cloud-export" disabled={state.exporting} testId={`export${title}`} onClick={startExport}>
          <Icon name="square.and.arrow.up" size={14} />
          <span className="cloud-export__label">{state.exporting ? 'Exporting…' : `Export ${title} Kit…`}</span>
          <span className="cloud-export__shortcut">{modKeyLabel()}E</span>
        </Button>
        <div aria-live="polite">
          {state.exported ? (
            <p className="cloud-saved">
              <Icon name="checkmark.circle.fill" size={11} />
              {`${title} ${state.exported.mode} · ${state.exported.filename}`}
            </p>
          ) : (
            <p className="cloud-note">{`ZIP · ${kit?.printedParts ?? exportPartCount(p)} STLs + LED plan + assembly notes`}</p>
          )}
          {pending?.snapshot === p && (
            <p className="cloud-note" data-testid={`${noun}ExportMessage`}>
              {`${pending.suggestedName} · ${pending.message}`}
            </p>
          )}
        </div>
      </footer>
    </aside>
  );
}

interface OutletRowProps {
  noun: string;
  ordinal: (typeof ORDINALS)[number];
  free: readonly CableSide[];
  enabled: boolean;
  side: CableSide;
  onToggle: (enabled: boolean) => void;
  onSelect: (side: CableSide) => void;
}

function OutletRow({ noun, ordinal, free, enabled, side, onToggle, onSelect }: OutletRowProps) {
  return (
    <>
      <Checkbox size={12} strong checked={enabled} onChange={onToggle} testId={`${noun}${ordinal}CableOutlet`}>
        {free.length === 1 ? `${ordinal} cable outlet · ${CABLE_SIDE_TITLE[free[0]!]}` : `${ordinal} cable outlet`}
      </Checkbox>
      {enabled && free.length > 1 && (
        <SegmentedControl
          hug
          label={`${ordinal} cable exit`}
          options={free.map((value) => ({ value, label: CABLE_SIDE_TITLE[value] }))}
          value={side}
          onChange={onSelect}
          testId={`${noun}${ordinal}CableSide`}
        />
      )}
    </>
  );
}
