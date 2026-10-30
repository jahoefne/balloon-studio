// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core/parameters';
import type { BalloonPreview, MeshBuffers, PurgeEstimate } from '../../core/types';
import { cancelExport } from '../../io/exportFlow';
import { lastStageProps, resetStudio, useAppStore, useBalloonStore } from '../../test/studioMock';
import { BalloonEditor } from './BalloonEditor';

vi.mock('../../stores', () => import('../../test/studioMock'));
vi.mock('../../preview/Stage', () => import('../../test/studioMock'));

const setBalloon = (change: Partial<BalloonPreview['parameters']>) => act(() => useBalloonStore.getState().apply({ ...useBalloonStore.getState().parameters, ...change }));
const setPattern = (change: Partial<BalloonPreview['pattern']>) => act(() => useBalloonStore.getState().setPattern({ ...useBalloonStore.getState().pattern, ...change }));

const mesh = (change: Partial<MeshBuffers> = {}): MeshBuffers => ({
  positions: new Float32Array(9),
  indices: new Uint32Array([0, 1, 2]),
  faceColors: new Uint8Array([1]),
  maxOverhang: 30,
  dimensions: { x: 181.26, y: 183.44, z: 220 },
  ...change,
});

const setBundle = (m: MeshBuffers, estimate: PurgeEstimate = { mixedLayers: 12, minimumChanges: 4, maximumChanges: 4, minimumGrams: 1.25, maximumGrams: 1.25 }) =>
  act(() => {
    const { parameters, pattern, purge, revision } = useBalloonStore.getState();
    useBalloonStore.setState({ bundle: { parameters, pattern, purge, mesh: m, estimate, missingGlyphs: [] }, faceColors: m.faceColors ?? null, estimate, revision: revision + 1, updating: false });
  });

const metrics = () =>
  [...screen.getByTestId('balloonMetrics').querySelectorAll('.ui-metric')].map((metric) => [
    metric.querySelector('dt')!.textContent,
    metric.querySelector('.ui-metric__number')!.textContent,
    metric.querySelector('.ui-metric__unit')?.textContent ?? '',
  ]);

const sliderRange = (title: string) => {
  const slider = screen.getByRole<HTMLInputElement>('slider', { name: `${title} slider` });
  return [Number(slider.min), Number(slider.max), Number(slider.step)];
};

const helpOf = (title: string) => screen.getByRole('slider', { name: `${title} slider` }).closest<HTMLElement>('[title]')?.title;

describe('BalloonEditor', () => {
  beforeEach(resetStudio);

  describe('footer', () => {
    it('labels export by format', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      const button = screen.getByTestId<HTMLButtonElement>('exportBalloon');
      expect(button.textContent).toContain('Export STL…');
      expect(screen.getByText('STL · millimetres · checked before export')).toBeTruthy();
      await user.selectOptions(screen.getByTestId('patternStyle'), 'Hearts');
      expect(button.textContent).toContain('Export 3MF…');
      expect(screen.getByText('3MF · millimetres · checked before export')).toBeTruthy();
    });

    it('commits, then shows “Preparing …” while the store is exporting', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      const field = screen.getByRole('textbox', { name: 'Widest diameter' });
      await user.clear(field);
      await user.type(field, '150');
      const button = screen.getByTestId<HTMLButtonElement>('exportBalloon');
      fireEvent.click(button);
      expect(useBalloonStore.getState().parameters.diameter).toBe(150);
      act(() => useBalloonStore.getState().setExporting(true));
      expect(button.textContent).toContain('Preparing STL…');
      expect(button.disabled).toBe(true);
      act(() => useBalloonStore.getState().setExporting(false));
      expect(button.textContent).toContain('Export STL…');
      cancelExport();
    });

    it('shows the saved line once a file is out', () => {
      render(<BalloonEditor />);
      act(() => useBalloonStore.getState().setExported({ filename: 'Balloon.stl', mode: 'saved' }));
      expect(screen.getByText('File saved · Balloon.stl')).toBeTruthy();
      act(() => useBalloonStore.getState().setExported({ filename: 'Balloon.stl', mode: 'downloaded' }));
      expect(screen.getByText('File downloaded · Balloon.stl')).toBeTruthy();
      expect(screen.queryByText(/checked before export/)).toBeNull();
    });
  });

  describe('Hollow for LEDs', () => {
    it('switches the wall controls, the notes and the advice', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      expect(screen.queryByRole('slider', { name: 'Wall thickness slider' })).toBeNull();
      expect(screen.getByText('Closed envelope, no basket. Choose wall thickness and infill in your slicer.')).toBeTruthy();
      expect(screen.queryByRole('checkbox', { name: 'Cutaway' })).toBeNull();

      await user.click(screen.getByTestId('hollowMode'));
      expect(useBalloonStore.getState().parameters.hollow).toBe(true);
      expect(sliderRange('Wall thickness')).toEqual([0.8, 2.4, 0.1]);
      expect(helpOf('Wall thickness')).toBe('Nominal shell thickness. A small allowance protects the wall around curves and grooves.');
      const opening = core.balloon.derived(useBalloonStore.getState().parameters).openingDiameter;
      expect(screen.getByText(`Opening Ø${opening.toFixed(1)} mm`)).toBeTruthy();
      expect(screen.getByText('Open underneath for LEDs. Increase the neck diameter for a larger opening.')).toBeTruthy();
      expect(screen.getByText('A real shell with a closed crown and open neck. Thin, translucent filament lets the LEDs glow through.')).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: 'Cutaway' })).toBeTruthy();
      const advice = screen.getByTestId('balloonAdvice');
      expect(advice.textContent).toContain('Shell printing · 0% infill');
      expect(advice.textContent).toContain('Use standard mode, not vase mode. Print neck down with a brim. The hollow crown may need supports; inspect your sliced layers.');
      expect(advice.querySelector('[data-symbol="exclamationmark.triangle"]')).toBeTruthy();
      expect(advice.classList.contains('ui-advice--accent')).toBe(true);
    });

    it('turning it off drops the wall thickness panel again', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      await user.click(screen.getByTestId('hollowMode'));
      await user.click(screen.getByTestId('hollowMode'));
      expect(screen.queryByRole('slider', { name: 'Wall thickness slider' })).toBeNull();
    });
  });

  describe('NECK / FLAT BASE', () => {
    it('names the section after what the neck holds', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      expect(screen.getByRole('heading', { name: 'FLAT BASE' })).toBeTruthy();
      await user.click(screen.getByTestId('hollowMode'));
      expect(screen.getByRole('heading', { name: 'NECK' })).toBeTruthy();
      await user.click(screen.getByTestId('hollowMode'));
      expect(screen.getByRole('heading', { name: 'FLAT BASE' })).toBeTruthy();
      await user.click(screen.getByTestId('basketAttachments'));
      expect(screen.getByRole('heading', { name: 'NECK' })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'FLAT BASE' })).toBeNull();
    });
  });

  describe('shape presets', () => {
    it('lights the matching shape, whatever the attachments', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      expect(screen.getByRole('button', { name: 'Classic' }).getAttribute('aria-pressed')).toBe('true');
      await user.click(screen.getByRole('button', { name: 'Round' }));
      expect(screen.getByRole('button', { name: 'Round' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: 'Classic' }).getAttribute('aria-pressed')).toBe('false');
      await user.click(screen.getByTestId('hollowMode'));
      await user.click(screen.getByTestId('ceilingAttachment'));
      expect(screen.getByRole('button', { name: 'Round' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('goes dark when the shape itself changes', () => {
      render(<BalloonEditor />);
      setBalloon({ shoulder: 60 });
      for (const name of ['Classic', 'Round', 'Tall']) expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
    });

    it('applying a shape keeps hollow and the attachments', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      setBalloon({ hollow: true, wallThickness: 1.5, hangingLoop: true, hangingWall: 7 });
      await user.click(screen.getByRole('button', { name: 'Tall' }));
      const { parameters } = useBalloonStore.getState();
      expect(parameters.diameter).toBe(core.balloon.normalize(core.balloon.presets.tall).diameter);
      expect(parameters).toMatchObject({ hollow: true, wallThickness: 1.5, hangingLoop: true, hangingWall: 7 });
    });
  });

  describe('controls', () => {
    it('has every sidebar control with the Mac range, step and help', () => {
      render(<BalloonEditor />);
      setBalloon({ hollow: true, stringHoles: true, hangingLoop: true });
      const { parameters } = useBalloonStore.getState();
      const d = core.balloon.derived(parameters);
      const table: [string, number, number, number][] = [
        ['Wall thickness', 0.8, 2.4, 0.1],
        ['Envelope height', 80, d.maximumHeight, 1],
        ['Widest diameter', 60, 240, 1],
        ['Vertical panels', 8, 32, 4],
        ['Panel depth', 0, 8, 0.5],
        ['Shoulder height', 50, 75, 1],
        ['Neck diameter', d.minimumNeckDiameter, d.maximumNeckDiameter, 1],
        ['Neck height', d.minimumNeckHeight, d.maximumNeckHeight, 1],
        ['Basket cord clearance', 2, 5, 0.5],
        ['Hanging cord clearance', 2, 5, 0.5],
        ['Eyelet thickness', 8, 16, 0.5],
        ['Material around hole', 4, 8, 0.5],
        ['Base flare radius', 2.5, 5, 0.5],
        ['Crown thickness', 3.4, 8, 0.2],
      ];
      for (const [title, lower, upper, step] of table) expect([title, ...sliderRange(title)]).toEqual([title, lower, upper, step]);
      expect(screen.getAllByRole('slider').map((slider) => slider.getAttribute('aria-label'))).toEqual(table.map(([title]) => `${title} slider`));
      expect(helpOf('Vertical panels')).toBe('8 to 32 panels, in groups of four, for a symmetric envelope.');
      expect(helpOf('Panel depth')).toBe('Depth of the grooves as a percentage of the radius. Zero makes a smooth envelope.');
      expect(helpOf('Shoulder height')).toBe('Where the balloon reaches its widest point, measured from the bottom.');
      expect(helpOf('Eyelet thickness')).toBe('Thickness from front to back along the cord hole. More material strengthens the eyelet.');
      expect(helpOf('Material around hole')).toBe('Material beside and above the cord hole. Increasing this makes the eyelet wider and taller.');
      expect(helpOf('Base flare radius')).toBe('Rounds and widens the join into the balloon. A larger flare also raises the hole to keep it clear.');
      expect(helpOf('Crown thickness')).toBe('Nominal thickness under the hanger, blended into the hollow shell. A thicker crown lets less light through.');
    });

    it('swaps the attachment notes', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      const solidNote = 'Two straight, crossing through-holes connect opposite sides of the neck. The bottom stays closed and flat.';
      const hollowNote = 'Four holes in a reinforced neck, at least 12 mm tall. The LED opening stays clear.';
      expect(screen.queryByText(solidNote)).toBeNull();
      await user.click(screen.getByTestId('basketAttachments'));
      expect(screen.getByText(solidNote)).toBeTruthy();
      await user.click(screen.getByTestId('hollowMode'));
      expect(screen.getByText(hollowNote)).toBeTruthy();
    });

    it('reports hanger and total height', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      expect(screen.queryByText(/Rounded eyelet/)).toBeNull();
      await user.click(screen.getByTestId('ceilingAttachment'));
      const d = core.balloon.derived(useBalloonStore.getState().parameters);
      expect(
        screen.getByText(
          `Rounded eyelet on a reinforced crown. Hanger height: ${d.loopHeight.toFixed(1)} mm. Total print height: ${d.totalHeight.toFixed(1)} mm. Envelope height is limited automatically to fit the P2S.`,
        ),
      ).toBeTruthy();
      expect(screen.getByText(/^Print the eyelet and its crown base solid/)).toBeTruthy();
    });
  });

  describe('preview column', () => {
    it('shows color swatches only for Solid', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      for (const name of ['Saffron', 'Sage', 'Porcelain', 'Rose']) {
        expect(screen.getByRole('button', { name: `${name} preview color` }).title).toBe(`${name} · preview color only`);
      }
      await user.click(screen.getByRole('button', { name: 'Rose preview color' }));
      expect(useAppStore.getState().balloonView.colorIndex).toBe(3);
      expect(screen.getByRole('button', { name: 'Rose preview color' }).getAttribute('aria-pressed')).toBe('true');
      await user.selectOptions(screen.getByTestId('patternStyle'), 'Hearts');
      expect(screen.queryByRole('button', { name: 'Rose preview color' })).toBeNull();
      expect(screen.getByTestId('purgeSummary')).toBeTruthy();
    });

    it('switches the third metric and reads the relief diameter from the mesh', () => {
      render(<BalloonEditor />);
      const p = () => useBalloonStore.getState().parameters;
      expect(metrics()).toEqual([
        ['DIAMETER', String(p().diameter), 'mm'],
        ['TOTAL HEIGHT', core.balloon.derived(p()).totalHeight.toFixed(1), 'mm'],
        ['PANELS', String(p().panels), ''],
      ]);
      setBalloon({ hollow: true });
      expect(metrics()[2]).toEqual(['LED OPENING', core.balloon.derived(p()).openingDiameter.toFixed(1), 'mm']);
      setPattern({ style: 'Night Flight' });
      expect(metrics()[0]).toEqual(['DIAMETER', '–', 'mm']);
      setBundle(mesh());
      expect(metrics()[0]).toEqual(['DIAMETER', '183.4', 'mm']);
    });

    it('warns about overhangs', () => {
      render(<BalloonEditor />);
      const advice = screen.getByTestId('balloonAdvice');
      expect(advice.textContent).toContain('Ready to make it real');
      expect(advice.textContent).toContain('Try 0.2 mm layers, 3 walls, 10% infill and an 8 mm brim. Print with the flat neck down.');
      expect(advice.querySelector('[data-symbol="info.circle"]')).toBeTruthy();
      setBundle(mesh({ maxOverhang: 52.3 }));
      expect(advice.textContent).toContain('Check supports in your slicer');
      expect(advice.textContent).toContain('Outward overhang reaches 53° from vertical. Inspect the sliced layers before printing.');
      expect(advice.classList.contains('ui-advice--warning')).toBe(true);
    });

    it('titles the column after an opened STL and shows the status', () => {
      render(<BalloonEditor />);
      expect(screen.getByRole('heading', { name: 'Your envelope' })).toBeTruthy();
      expect(screen.getByText('Live preview')).toBeTruthy();
      act(() => useBalloonStore.setState({ openedSTLName: 'a.stl', updating: true }));
      expect(screen.getByRole('heading', { name: 'Editable balloon' })).toBeTruthy();
      expect(screen.getByText('Updating…')).toBeTruthy();
      expect(screen.getByText('Fits P2S')).toBeTruthy();
      expect(screen.getByText('256³ mm')).toBeTruthy();
    });

    it('passes the Mac’s props to the Stage', () => {
      render(<BalloonEditor />);
      expect(lastStageProps()).toMatchObject({ mesh: null, geometryKey: '0', showPlate: true, wireframe: false, cutaway: false, inspectOpening: false, inspectTop: false, filledNeck: true, faceColors: undefined });
      expect(lastStageProps().neckDiameter).toBe(useBalloonStore.getState().parameters.neckDiameter);
      const faceColors = new Uint8Array([1]);
      setPattern({ style: 'Hearts' });
      setBundle(mesh({ faceColors }));
      expect(lastStageProps()).toMatchObject({ geometryKey: '1', faceColors });
      expect(lastStageProps().color).not.toEqual(lastStageProps().detailColor);
    });

    it('applies the view button rules', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      expect(screen.queryByRole('button', { name: /View/ })).toBeNull();

      setBalloon({ stringHoles: true });
      await user.click(screen.getByRole('button', { name: 'View neck' }));
      expect(lastStageProps()).toMatchObject({ inspectOpening: true, showPlate: false });
      await user.click(screen.getByRole('button', { name: 'Whole balloon' }));
      expect(lastStageProps()).toMatchObject({ inspectOpening: false, showPlate: true });

      setBalloon({ hollow: true, hangingLoop: true });
      await user.click(screen.getByRole('checkbox', { name: 'Cutaway' }));
      expect(lastStageProps().cutaway).toBe(true);
      await user.click(screen.getByRole('button', { name: 'View opening' }));
      expect(lastStageProps()).toMatchObject({ inspectOpening: true, cutaway: false });
      await user.click(screen.getByRole('button', { name: 'View hanger' }));
      expect(lastStageProps()).toMatchObject({ inspectOpening: false, inspectTop: true, showPlate: false });
      await user.click(screen.getByRole('checkbox', { name: 'Cutaway' }));
      expect(lastStageProps()).toMatchObject({ inspectOpening: false, inspectTop: false, cutaway: true });
      await user.click(screen.getByRole('button', { name: 'View hanger' }));
      const before = lastStageProps().resetCamera;
      await user.click(screen.getByRole('button', { name: 'Reset camera' }));
      expect(lastStageProps()).toMatchObject({ inspectTop: false, inspectOpening: false, resetCamera: before + 1 });
    });

    it('never asks the Stage for a view the balloon lost', () => {
      render(<BalloonEditor />);
      setBalloon({ hollow: true, hangingLoop: true });
      act(() => useAppStore.getState().setBalloonView({ cutaway: true, inspectOpening: true, inspectTop: true }));
      setBalloon({ hollow: false, hangingLoop: false });
      expect(lastStageProps()).toMatchObject({ cutaway: false, inspectOpening: false, inspectTop: false });
    });

    it('toggles build plate and wireframe', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      await user.click(screen.getByRole('checkbox', { name: 'Build plate' }));
      await user.click(screen.getByRole('checkbox', { name: 'Wireframe' }));
      expect(lastStageProps()).toMatchObject({ showPlate: false, wireframe: true });
    });

    it('explains the cutaway', () => {
      render(<BalloonEditor />);
      setBalloon({ hollow: true });
      expect(screen.getByRole('checkbox', { name: 'Cutaway' }).closest('label')!.title).toBe('Preview the cavity. The exported file always contains the complete shell.');
    });
  });

  describe('PatternEditor', () => {
    const style = (value: BalloonPreview['pattern']['style']) => setPattern({ style: value });

    it('shows nothing but the picker for Solid', () => {
      render(<BalloonEditor />);
      expect(screen.getByRole('heading', { name: 'PATTERN & COLOR' })).toBeTruthy();
      expect([...screen.getByTestId<HTMLSelectElement>('patternStyle').options].map((option) => option.text)).toEqual([
        'Solid',
        'Horizontal stripes',
        'Hearts',
        'Polka dots',
        'Diamonds',
        'Text',
        'Night Flight',
        'Summit Cable Car',
      ]);
      expect(screen.queryByText('P2S waste assumptions')).toBeNull();
    });

    it('stripes: bands 2–24', () => {
      render(<BalloonEditor />);
      style('Horizontal stripes');
      expect(sliderRange('Total bands')).toEqual([2, 24, 1]);
      expect(screen.getByText('Alternating colors from bottom to top. Fewer bands mean fewer changes.')).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Base · filament 1' })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Pattern · filament 2' })).toBeTruthy();
    });

    it('reliefs: depth, cap and their own color labels', () => {
      render(<BalloonEditor />);
      style('Night Flight');
      expect(screen.getByText('Little aviators at night')).toBeTruthy();
      expect(sliderRange('Relief depth')).toEqual([1.2, 4, 0.1]);
      expect(sliderRange('Cap height')).toEqual([10, 28, 1]);
      expect(screen.getByText(/^Sculpted shapes bridge the panel grooves/)).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Body & relief · filament 1' })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Cap · filament 2' })).toBeTruthy();
      style('Summit Cable Car');
      expect(screen.getByText('A night ride between two peaks')).toBeTruthy();
      expect(screen.getByText(/^Two summits on opposite sides/)).toBeTruthy();
    });

    it('text: field, font, repeats and copy count', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      setPattern({ style: 'Text', text: '' });
      const { pattern, parameters } = useBalloonStore.getState();
      expect(sliderRange('Repeats around balloon')).toEqual([1, 24, 1]);
      expect(sliderRange('Text height')).toEqual([3, core.balloon.pattern.derived(pattern, parameters).maximumTextHeight, 1]);
      expect(screen.getByText('Enter a name or message to add lettering.')).toBeTruthy();
      const field = screen.getByTestId<HTMLInputElement>('balloonText');
      expect(field.placeholder).toBe('Name or message');
      expect(field.getAttribute('aria-label')).toBe('Balloon text');
      await user.type(field, 'Mia');
      expect(useBalloonStore.getState().pattern.text).toBe('Mia');
      expect(screen.queryByText('Enter a name or message to add lettering.')).toBeNull();

      const font = screen.getByTestId<HTMLSelectElement>('balloonTextFont');
      expect([...font.options].map((option) => option.text)).toEqual(['Rounded', 'Sans serif', 'Serif', 'Handwritten', 'Monospaced']);
      expect(font.closest('.ui-select--rich')).toBeTruthy();
      expect(font.options[4]!.style.fontFamily).toContain('Mono');
      await user.selectOptions(font, 'Serif');
      expect(useBalloonStore.getState().pattern.textFont).toBe('Serif');

      setPattern({ textRepeats: 1 });
      expect(screen.getByText(/^1 copy, evenly spaced in one row\./)).toBeTruthy();
      setPattern({ textRepeats: 3 });
      expect(screen.getByText(/^3 copies, evenly spaced in one row\./)).toBeTruthy();
    });

    it('limits text to 64 characters', () => {
      render(<BalloonEditor />);
      style('Text');
      fireEvent.change(screen.getByTestId('balloonText'), { target: { value: 'x'.repeat(70) } });
      expect(useBalloonStore.getState().pattern.text).toHaveLength(64);
    });

    it('shapes: per row, rows, size and the count', () => {
      render(<BalloonEditor />);
      style('Polka dots');
      const { pattern, parameters } = useBalloonStore.getState();
      expect(sliderRange('Shapes per row')).toEqual([1, 24, 1]);
      expect(sliderRange('Rows')).toEqual([1, 6, 1]);
      expect(sliderRange('Shape size')).toEqual([3, core.balloon.pattern.derived(pattern, parameters).maximumSize, 1]);
      expect(screen.getByText(new RegExp(`^${pattern.repeats * pattern.rows} shapes\\.`))).toBeTruthy();
    });

    it('says when both colors match', () => {
      render(<BalloonEditor />);
      style('Hearts');
      const note = 'Matching colors use one filament: no pattern color changes.';
      expect(screen.queryByText(note)).toBeNull();
      const { base } = useBalloonStore.getState().pattern;
      setPattern({ detail: base });
      expect(screen.getByText(note)).toBeTruthy();
    });

    it('has the waste assumptions and the Bambu link', async () => {
      const user = userEvent.setup();
      render(<BalloonEditor />);
      style('Hearts');
      await user.click(screen.getByText('P2S waste assumptions'));
      expect(sliderRange('Base → pattern')).toEqual([0, 1500, 10]);
      expect(sliderRange('Pattern → base')).toEqual([0, 1500, 10]);
      expect(sliderRange('Flush multiplier')).toEqual([0, 2, 0.1]);
      expect(sliderRange('Density (g/cm³)')).toEqual([0.5, 2, 0.01]);
      const layer = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Layer height' });
      expect([...layer.options].map((option) => option.text)).toEqual(['0.08 mm', '0.12 mm', '0.16 mm', '0.20 mm', '0.24 mm', '0.28 mm', '0.32 mm']);
      await user.selectOptions(layer, '0.12 mm');
      expect(useBalloonStore.getState().purge.layerHeight).toBe(0.12);
      const link = screen.getByRole<HTMLAnchorElement>('link', { name: 'About Bambu flushing volumes' });
      expect(link.href).toBe('https://wiki.bambulab.com/en/software/bambu-studio/reduce-wasting-during-filament-change');
      expect(screen.getByText(/^3MF preserves filament painting\./)).toBeTruthy();
    });
  });

  describe('PurgeSummary', () => {
    const summary = () => within(screen.getByTestId('purgeSummary'));

    it('formats grams and changes like the Mac', () => {
      render(<BalloonEditor />);
      setPattern({ style: 'Hearts' });
      setBundle(mesh(), { mixedLayers: 12, minimumChanges: 4, maximumChanges: 4, minimumGrams: 1.25, maximumGrams: 1.27 });
      expect(summary().getByText('≈ 1.3 g')).toBeTruthy();
      expect(summary().getByText('4 color changes · 12 layers using both colors')).toBeTruthy();
      setBundle(mesh(), { mixedLayers: 2, minimumChanges: 1, maximumChanges: 1, minimumGrams: 0.25, maximumGrams: 0.25 });
      // C printf: the tie goes to even.
      expect(summary().getByText('≈ 0.2 g')).toBeTruthy();
      expect(summary().getByText('1 color change · 2 layers using both colors')).toBeTruthy();
      setBundle(mesh(), { mixedLayers: 9, minimumChanges: 3, maximumChanges: 6, minimumGrams: 1.04, maximumGrams: 2.36 });
      expect(summary().getByText('≈ 1.0–2.4 g')).toBeTruthy();
      expect(summary().getByText('3–6 color changes · 9 layers using both colors')).toBeTruthy();
      expect(summary().getByText(/^Change-related chute waste only\./)).toBeTruthy();
      expect(summary().getByText('P2S · estimated filament poop')).toBeTruthy();
    });

    it('shows “Updating…” in place of the grams', () => {
      render(<BalloonEditor />);
      setPattern({ style: 'Hearts' });
      expect(useBalloonStore.getState().updating).toBe(true);
      expect(summary().getByText('Updating…')).toBeTruthy();
    });
  });
});
