import { useId, type ReactNode } from 'react';
import { core } from '#core/parameters';
import { printfFixed } from '../../core/swift/format';
import { BALLOON_PATTERNS, BALLOON_TEXT_FONTS, type BalloonPattern, type BalloonTextFont, type FilamentColor, type PatternSettings, type PurgeSettings } from '../../core/types';
import { useBalloonStore } from '../../stores';
import { balloonTextFontStyle, ColorPicker, DisclosureGroup, ParameterControl, SectionLabel, Select } from '../../ui';

// PatternEditor (PatternEditor.swift:11-111).

const PATTERN_OPTIONS = BALLOON_PATTERNS.map((style) => ({ value: style, label: style }));
const FONT_OPTIONS = BALLOON_TEXT_FONTS.map((font) => ({ value: font, label: font, style: balloonTextFontStyle(font) }));
const LAYER_HEIGHT_OPTIONS = [0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32].map((height) => ({ value: height, label: `${printfFixed(height, 2)} mm` }));

/** `CharacterSet.whitespacesAndNewlines`, unlike `String.trim`, leaves U+FEFF alone. */
const isBlank = (text: string): boolean => /^[\p{Z}\u0009-\u000D\u0085]*$/u.test(text);

const setPattern = <K extends keyof PatternSettings>(key: K, value: PatternSettings[K]) => {
  const { pattern, setPattern: set } = useBalloonStore.getState();
  set({ ...pattern, [key]: value });
};

const setPurge = <K extends keyof PurgeSettings>(key: K, value: PurgeSettings[K]) => {
  const { purge, setPurge: set } = useBalloonStore.getState();
  set({ ...purge, [key]: value });
};

/** `number(_:)`: `Int($0)` on the way in. */
const setCount = (key: 'bands' | 'repeats' | 'rows' | 'textRepeats', value: number) => setPattern(key, Math.trunc(value));

function Caption({ children }: { children: ReactNode }) {
  return <p className="balloon-caption">{children}</p>;
}

/** No string in Swift, where CoreText's fallback always finds a glyph: with the bundled fonts a character can be left out (core/text/shaper.ts). */
function MissingGlyphs() {
  const glyphs = useBalloonStore((state) => state.bundle?.missingGlyphs) ?? [];
  // The live region stays mounted, so the announcement fires when the hint appears; `:empty` takes it out of the gaps.
  return (
    <div className="balloon-live" aria-live="polite" data-testid="missingGlyphs">
      {glyphs.length > 0 && (
        <Caption>
          Not in any bundled font: {glyphs.join(' ')}. {glyphs.length === 1 ? 'This character is' : 'These characters are'} left out.
        </Caption>
      )}
    </div>
  );
}

function ColorChoice({ label, field }: { label: string; field: 'base' | 'detail' | 'flightBody' | 'flightCap' }) {
  const value = useBalloonStore((state) => state.pattern[field]);
  return <ColorPicker label={label} value={value} onChange={(color: FilamentColor) => setPattern(field, color)} />;
}

export function PatternEditor() {
  const parameters = useBalloonStore((state) => state.parameters);
  const pattern = useBalloonStore((state) => state.pattern);
  const uses3MF = useBalloonStore((state) => state.uses3MF());
  const { hasRelief, baseColor, detailColor, maximumTextHeight, maximumSize } = core.balloon.pattern.derived(pattern, parameters);
  const textId = useId();

  return (
    <div className="balloon-section">
      <SectionLabel>PATTERN &amp; COLOR</SectionLabel>
      <Select<BalloonPattern> hug label="Pattern" options={PATTERN_OPTIONS} value={pattern.style} testId="patternStyle" onChange={(style) => setPattern('style', style)} />
      {uses3MF && (
        <>
          {pattern.style === 'Horizontal stripes' ? (
            <>
              <ParameterControl title="Total bands" value={pattern.bands} range={[2, 24]} onChange={(value) => setCount('bands', value)} />
              <Caption>Alternating colors from bottom to top. Fewer bands mean fewer changes.</Caption>
            </>
          ) : hasRelief ? (
            <>
              {pattern.style === 'Night Flight' ? (
                <>
                  <p className="balloon-subhead">Little aviators at night</p>
                  <Caption>
                    Two detailed vintage planes on opposite sides, with looping flight paths, soft cloud banks, a clean crescent moon and stars. Raised artwork shares the body color;
                    the cap adds one planned filament change.
                  </Caption>
                </>
              ) : (
                <>
                  <p className="balloon-subhead">A night ride between two peaks</p>
                  <Caption>
                    Two summits on opposite sides, each with a timber station and its bullwheels on the peak. The cable swings between them, and on each rise a vintage Swiss cabin
                    climbs with a family and their dog at the windows. Faceted mountains with snow caps and a hiking trail, firs and a chalet in the valley, a crescent moon, clouds
                    and stars. Raised artwork shares the body color; the cap adds one planned filament change.
                  </Caption>
                </>
              )}
              <ParameterControl title="Relief depth" value={pattern.reliefDepth} range={[1.2, 4]} step={0.1} unit="mm" onChange={(value) => setPattern('reliefDepth', value)} />
              <ParameterControl title="Cap height" value={pattern.capHeight} range={[10, 28]} unit="%" onChange={(value) => setPattern('capHeight', value)} />
              <Caption>
                Sculpted shapes bridge the panel grooves to keep their outlines clear. Depth is measured above the panel crests. The cap includes the hanger. Check relief edges and
                supports in the slicer.
              </Caption>
            </>
          ) : pattern.style === 'Text' ? (
            <>
              <div className="balloon-text-field">
                <label htmlFor={textId}>Your text</label>
                <input
                  id={textId}
                  type="text"
                  placeholder="Name or message"
                  aria-label="Balloon text"
                  data-testid="balloonText"
                  value={pattern.text}
                  onChange={(event) => setPattern('text', event.currentTarget.value)}
                />
              </div>
              <MissingGlyphs />
              <Select<BalloonTextFont>
                hug
                rich
                label="Font"
                options={FONT_OPTIONS}
                value={pattern.textFont}
                testId="balloonTextFont"
                onChange={(font) => setPattern('textFont', font)}
              />
              <ParameterControl title="Repeats around balloon" value={pattern.textRepeats} range={[1, 24]} onChange={(value) => setCount('textRepeats', value)} />
              <ParameterControl title="Text height" value={pattern.textHeight} range={[3, maximumTextHeight]} unit="mm" onChange={(value) => setPattern('textHeight', value)} />
              <Caption>
                {pattern.textRepeats} {pattern.textRepeats === 1 ? 'copy' : 'copies'}, evenly spaced in one row. Long messages shrink to fit. Use fewer repeats for larger letters. Up
                to 64 characters.
              </Caption>
              {isBlank(pattern.text) && <Caption>Enter a name or message to add lettering.</Caption>}
            </>
          ) : (
            <>
              <ParameterControl title="Shapes per row" value={pattern.repeats} range={[1, 24]} onChange={(value) => setCount('repeats', value)} />
              <ParameterControl title="Rows" value={pattern.rows} range={[1, 6]} onChange={(value) => setCount('rows', value)} />
              <ParameterControl title="Shape size" value={pattern.size} range={[3, maximumSize]} unit="mm" onChange={(value) => setPattern('size', value)} />
              <Caption>
                {pattern.repeats * pattern.rows} shapes. Size is limited to keep them apart. More rows or taller shapes usually add waste; more shapes on the same layers need not.
              </Caption>
            </>
          )}
          {hasRelief ? (
            <>
              <ColorChoice label="Body & relief · filament 1" field="flightBody" />
              <ColorChoice label="Cap · filament 2" field="flightCap" />
            </>
          ) : (
            <>
              <ColorChoice label="Base · filament 1" field="base" />
              <ColorChoice label="Pattern · filament 2" field="detail" />
            </>
          )}
          {baseColor === detailColor && <Caption>Matching colors use one filament: no pattern color changes.</Caption>}
          <WasteAssumptions />
          <Caption>
            3MF preserves filament painting. In Bambu Studio, map the two colors to your AMS filaments and select your P2S profile. Set the object’s default filament to your base
            color too.
          </Caption>
        </>
      )}
    </div>
  );
}

function WasteAssumptions() {
  const purge = useBalloonStore((state) => state.purge);
  return (
    <DisclosureGroup title="P2S waste assumptions">
      <Select<number> hug label="Layer height" options={LAYER_HEIGHT_OPTIONS} value={purge.layerHeight} onChange={(value) => setPurge('layerHeight', value)} />
      <ParameterControl title="Base → pattern" value={purge.baseToDetail} range={[0, 1500]} step={10} unit="mm³" onChange={(value) => setPurge('baseToDetail', value)} />
      <ParameterControl title="Pattern → base" value={purge.detailToBase} range={[0, 1500]} step={10} unit="mm³" onChange={(value) => setPurge('detailToBase', value)} />
      <ParameterControl title="Flush multiplier" value={purge.multiplier} range={[0, 2]} step={0.1} unit="×" onChange={(value) => setPurge('multiplier', value)} />
      <ParameterControl title="Density (g/cm³)" value={purge.density} range={[0.5, 2]} step={0.01} onChange={(value) => setPurge('density', value)} />
      <Caption>
        400 mm³ per change is an editable example, not a measured P2S default. Copy both directional volumes and the multiplier from Bambu Studio. Use compatible filaments and match
        the layer height when slicing.
      </Caption>
      <a className="balloon-link" href="https://wiki.bambulab.com/en/software/bambu-studio/reduce-wasting-during-filament-change" target="_blank" rel="noreferrer">
        About Bambu flushing volumes
      </a>
    </DisclosureGroup>
  );
}
