// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core';
import { core as parameterCore } from '#core/parameters';
import { FIGURE_STYLE_INFO, FIGURE_STYLES, type FigurePreview } from '../../core/types';
import type { StageProps } from '../../preview';
import { createStudio } from '../../stores/studio';
import { testDeps } from '../../stores/testKit';
import { FigureEditor } from './FigureEditor';
import { silhouettePath } from './FigureSilhouette';
import FigureEditorDefault from './index';

const stage = vi.hoisted(() => ({ props: null as StageProps | null }));
vi.mock('../../preview', () => ({
  Stage: (props: StageProps) => {
    stage.props = props;
    return <div data-testid="stage" />;
  },
}));

const setup = () => {
  const { deps, preview, commitEditing } = testDeps();
  const studio = createStudio(deps);
  const store = studio.figure;
  const onExport = vi.fn();
  render(<FigureEditor store={store} onExport={onExport} />);
  /** Answers the preview request in flight. */
  const finishPreview = (value: FigurePreview = core.figure.preview(store.getState().parameters)) =>
    act(async () => {
      await preview.calls.at(-1)!.current(value);
    });
  return { store, preview, onExport, commitEditing, finishPreview, user: userEvent.setup() };
};

const checkbox = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name });

beforeEach(() => {
  stage.props = null;
});

describe('FigureEditor', () => {
  it('the index default-exports the editor', () => {
    expect(FigureEditorDefault).toBe(FigureEditor);
  });

  it('asks for the first preview itself', () => {
    const { preview } = setup();
    expect(preview.calls).toHaveLength(1);
    expect(screen.getByText('Updating…')).toBeTruthy();
    expect(stage.props!.mesh).toBeNull();
  });

  it('lists the seven figures in Swift order and selects one', async () => {
    const { store, user } = setup();
    const cards = screen.getAllByRole('button', { name: / figure$/ });
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(FIGURE_STYLES.map((style) => `${FIGURE_STYLE_INFO[style].title} figure`));
    expect(cards.map((card) => card.getAttribute('aria-pressed'))).toEqual(FIGURE_STYLES.map((style) => String(style === store.getState().parameters.style)));
    await user.click(screen.getByRole('button', { name: 'Moon figure' }));
    expect(store.getState().parameters.style).toBe('moon');
    expect(screen.getByRole('heading', { name: 'Moon figure' })).toBeTruthy();
  });

  it.each(FIGURE_STYLES)('draws the %s silhouette without NaN', (style) => {
    setup();
    const svg = screen.getByTestId(`figureSilhouette-${style}`);
    expect(svg.getAttribute('viewBox')).toBe('0 0 28 28');
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('fill-rule')).toBe('evenodd');
    const d = path.getAttribute('d')!;
    expect(d).toMatch(/^M/);
    expect(d).not.toMatch(/NaN|Infinity/);
    const numbers = d.split(/[MLZ ]+/).filter(Boolean).map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(28);
    // One subpath per loop, so the windows stay open under even-odd.
    expect(d.match(/M/g)).toHaveLength(parameterCore.figure.outline(style).loops.length);
  });

  it('fits and centers a silhouette like path(in:)', () => {
    const outline = { loops: [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }]], rounding: 0, minX: 0, maxX: 4, minY: 0, maxY: 2, centroid: { x: 0, y: 0 }, rawHeight: 2, rawWidth: 4 };
    expect(silhouettePath(outline, 28)).toBe('M0.000 21.000L28.000 21.000L28.000 7.000Z');
  });

  it('renames the edge and hides the dome controls on a flat figure', async () => {
    const { user } = setup();
    expect(screen.getByRole('textbox', { name: 'Edge band' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Dome height' })).toBeTruthy();
    expect(checkbox('Domed on both sides')).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: 'Flat' }));
    expect(screen.getByRole('textbox', { name: 'Thickness' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Edge band' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Dome height' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Domed on both sides' })).toBeNull();
    expect(screen.getByText('A plain slab')).toBeTruthy();
  });

  it('switches the two-sided text and the print badge', async () => {
    const { store, user } = setup();
    expect(screen.getByText('The flat back prints without supports and sits well on the bed.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Print view' }));
    expect(screen.getByTestId('stageBadge').textContent).toBe('Print view · flat back on the bed');

    await user.click(checkbox('Domed on both sides'));
    expect(store.getState().parameters.doubleSided).toBe(true);
    expect(screen.getByText(/^Needs supports under the lower dome\./)).toBeTruthy();
    expect(screen.getByTestId('stageBadge').textContent).toBe('Print view · supports under the lower dome');
  });

  it('switches the chain hole text', async () => {
    const { store, user } = setup();
    expect(screen.getByText(/^The hole sits as high as the figure allows/)).toBeTruthy();
    await user.click(checkbox('Second hole at the bottom'));
    expect(store.getState().parameters.chainHole).toBe(true);
    expect(screen.getByText(/^For a figure hanging below this one/)).toBeTruthy();
    expect(screen.queryByText(/^The hole sits as high/)).toBeNull();
  });

  it('warns when a hole has no room', async () => {
    const { store, finishPreview } = setup();
    const preview = core.figure.preview(store.getState().parameters);
    expect(screen.queryByTestId('figureHoleWarning')).toBeNull();

    await finishPreview({ ...preview, holes: 0, holesWanted: 1, hangingHole: null });
    expect(screen.getByTestId('figureHoleWarning').textContent).toBe('No room for the thread hole: make the figure taller or the hole smaller.');
    expect(screen.getByTestId('figureHoleWarning').dataset.tone).toBe('warning');
  });

  it('warns about the second hole when only the first fits', async () => {
    const { store, finishPreview } = setup();
    const preview = core.figure.preview(store.getState().parameters);
    await finishPreview({ ...preview, holes: 1, holesWanted: 2, hangingHole: { x: 0, y: 1 }, chainHole: null });
    expect(screen.getByTestId('figureHoleWarning').textContent).toBe('No room for the second hole: make the figure taller or the hole smaller.');
  });

  it('both export buttons go through beginExport, with their variant', async () => {
    const { store, onExport, user } = setup();
    const beginExport = vi.spyOn(store.getState(), 'beginExport');
    store.setState({ beginExport });
    const parameters = store.getState().parameters;

    await user.click(screen.getByTestId('exportFigure'));
    expect(onExport).toHaveBeenLastCalledWith({ parameters, variant: 'single' });

    await user.click(screen.getByRole('button', { name: 'Export all seven as a set (ZIP)…' }));
    expect(onExport).toHaveBeenLastCalledWith({ parameters, variant: 'set' });
    expect(beginExport).toHaveBeenCalledTimes(2);
  });

  it('exports the value still being typed, because beginExport commits first', async () => {
    const { store, onExport, commitEditing, user } = setup();
    commitEditing.mockImplementation(() => store.getState().setField('height', 75));
    await user.click(screen.getByTestId('exportFigure'));
    expect(onExport.mock.calls[0]![0].parameters.height).toBe(75);
  });

  it('shows Preparing and disables both buttons while exporting', () => {
    const { store, onExport } = setup();
    act(() => store.getState().setExporting(true));
    const single = screen.getByTestId<HTMLButtonElement>('exportFigure');
    expect(single.textContent).toContain('Preparing figure…');
    expect(single.disabled).toBe(true);
    expect(screen.getByTestId<HTMLButtonElement>('exportFigureSet').disabled).toBe(true);
    expect(onExport).not.toHaveBeenCalled();
  });

  it('replaces the footer hint with the saved line', () => {
    const { store } = setup();
    expect(screen.getByText('One STL per figure · thread hole included · millimetres')).toBeTruthy();
    act(() => store.getState().setExported({ filename: 'Mobile-Figure-star-60mm.stl', mode: 'saved' }));
    expect(screen.getByRole('status').textContent).toBe('Saved · Mobile-Figure-star-60mm.stl');
    expect(screen.queryByText('One STL per figure · thread hole included · millimetres')).toBeNull();
    act(() => store.getState().setExported({ filename: 'Mobile-Figures-60mm-set.zip', mode: 'downloaded' }));
    expect(screen.getByRole('status').textContent).toBe('Downloaded · Mobile-Figures-60mm-set.zip');
  });

  it('shows and dismisses the export failure', async () => {
    const { store, user } = setup();
    act(() => store.getState().setError('Disk full'));
    const alert = screen.getByRole('alertdialog', { name: 'Figure export failed' });
    expect(within(alert).getByText('Disk full')).toBeTruthy();
    await user.click(within(alert).getByRole('button', { name: 'OK' }));
    expect(store.getState().error).toBeNull();
  });

  it('starts hanging: colored faces, no plate and no Build plate toggle', async () => {
    const { store, finishPreview, user } = setup();
    await finishPreview();
    const bundle = store.getState().bundle!;
    expect(screen.getByTestId('stageBadge').textContent).toBe('As it hangs · thread through the hole');
    expect(screen.queryByRole('checkbox', { name: 'Build plate' })).toBeNull();
    expect(stage.props).toMatchObject({
      mesh: bundle.hangingMesh,
      faceColors: bundle.hangingMesh.faceColors,
      geometryKey: '1:hanging',
      showPlate: false,
      compactObject: true,
      minimumScale: 40,
      objectName: 'figure',
      sharpEdges: true,
      smoothAngle: Math.PI / 5,
      detailColor: [0.82, 0.82, 0.82],
    });
    const camera = stage.props!.resetCamera;

    await user.click(screen.getByRole('button', { name: 'Print view' }));
    expect(stage.props).toMatchObject({ mesh: bundle.printMesh, geometryKey: '1:print', showPlate: true, resetCamera: camera + 1 });
    expect(stage.props!.faceColors).toBeUndefined();
    await user.click(checkbox('Build plate'));
    expect(stage.props!.showPlate).toBe(false);
    expect(screen.getByRole('button', { name: 'Hanging view' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Reset figure camera' }));
    expect(stage.props!.resetCamera).toBe(camera + 2);
  });

  it('does not smooth a flat figure', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Flat' }));
    expect(stage.props!.smoothAngle).toBe(0);
  });

  it('has five swatches with the help text, and they change the color', async () => {
    const { user } = setup();
    const swatches = screen.getAllByTitle('Preview colour only');
    expect(swatches).toHaveLength(5);
    const first = stage.props!.color;
    await user.click(swatches[3]!);
    expect(swatches[3]!.getAttribute('aria-pressed')).toBe('true');
    expect(stage.props!.color).not.toEqual(first);
    await user.click(checkbox('Wireframe'));
    expect(stage.props!.wireframe).toBe(true);
  });

  it('shows the metrics with up to one decimal', async () => {
    const { store, preview, finishPreview } = setup();
    act(() => store.getState().apply({ ...store.getState().parameters, height: 60, edge: 1.6, dome: 3.2, holeDiameter: 2.5 }));
    await vi.waitFor(() => expect(preview.calls).toHaveLength(2));
    await finishPreview({ ...core.figure.preview(store.getState().parameters), width: 57.14, holes: 2 });
    const metric = (title: string) => screen.getByText(title).parentElement!.textContent;
    expect(metric('SIZE')).toBe('SIZE57.1 × 60mm');
    expect(metric('THICKNESS')).toBe('THICKNESS4.8mm');
    expect(metric('THREAD HOLE')).toBe('THREAD HOLEØ 2.5 · 2mm');
  });

  it('has the Mac advice row', () => {
    setup();
    expect(screen.getByText('Print flat back down, then thread and hang')).toBeTruthy();
    expect(screen.getByText(/^No supports needed\. Tie a loop through the hole/)).toBeTruthy();
  });

  it('applies the Swift ranges and steps to its parameters', async () => {
    const { store, user } = setup();
    const expected = [
      ['Height', 40, 120, 1],
      ['Edge band', 0.8, 6, 0.2],
      ['Dome height', 0.8, 10, 0.2],
      ['Thread hole', 1.5, 4, 0.5],
      ['Material around hole', 1.5, 6, 0.5],
    ] as const;
    for (const [title, lower, upper, step] of expected) {
      const slider = screen.getByRole<HTMLInputElement>('slider', { name: `${title} slider` });
      expect([Number(slider.min), Number(slider.max), Number(slider.step)]).toEqual([lower, upper, step]);
    }
    const field = screen.getByRole('textbox', { name: 'Height' });
    await user.clear(field);
    await user.type(field, '75{Enter}');
    expect(store.getState().parameters.height).toBe(75);
  });
});
