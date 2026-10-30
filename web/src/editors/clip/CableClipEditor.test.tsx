// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core';
import type { CableClipParameters, ClipPreview } from '../../core/types';
import type { StageProps } from '../../preview';
import { createStudio } from '../../stores/studio';
import { testDeps } from '../../stores/testKit';
import { number02 } from '../../ui';
import { CableClipEditor } from './CableClipEditor';
import CableClipEditorDefault from './index';

const stage = vi.hoisted(() => ({ props: null as StageProps | null }));
vi.mock('../../preview', () => ({
  Stage: (props: StageProps) => {
    stage.props = props;
    return <div data-testid="stage" />;
  },
}));

const setup = (initial: Partial<CableClipParameters> = {}) => {
  const { deps, preview } = testDeps();
  const studio = createStudio(deps);
  const store = studio.clip;
  store.getState().apply({ ...store.getState().parameters, ...initial });
  const onExport = vi.fn();
  render(<CableClipEditor store={store} onExport={onExport} />);
  const finishPreview = (value: ClipPreview = core.clip.preview(store.getState().parameters)) =>
    act(async () => {
      await preview.calls.at(-1)!.current(value);
    });
  return { store, preview, onExport, finishPreview, user: userEvent.setup() };
};

const checkbox = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name });
const field = (name: string) => screen.queryByRole('textbox', { name });
const metric = (title: string) => screen.getByText(title).parentElement!.textContent;

/** `CableClip.problem`: a nail head too small for its nail. */
const blocked = { mount: 'nail', nailDiameter: 4, nailHeadDiameter: 2 } as const;

beforeEach(() => {
  stage.props = null;
});

describe('CableClipEditor', () => {
  it('the index default-exports the editor', () => {
    expect(CableClipEditorDefault).toBe(CableClipEditor);
  });

  it('applies the Swift ranges and steps, in Swift order', () => {
    setup();
    const expected = [
      ['Cable diameter', 2, 6, 0.05],
      ['Plate thickness', 1.2, 4, 0.1],
      ['Nail shaft', 1, 4, 0.1],
      ['Nail head', 2, 8, 0.1],
      ['Head height', 0.3, 2, 0.1],
      ['Nail gap from the strap', 0.4, 10, 0.5],
      ['Length along the cable', 4, 12, 0.5],
      ['Thickness', 0.6, 1.2, 0.1],
      ['Overlap below the cable', 0.3, 1.5, 0.1],
    ] as const;
    const sliders = screen.getAllByRole<HTMLInputElement>('slider');
    expect(sliders.map((slider) => slider.getAttribute('aria-label'))).toEqual(expected.map(([title]) => `${title} slider`));
    expected.forEach(([, lower, upper, step], i) => {
      const slider = sliders[i]!;
      expect([Number(slider.min), Number(slider.max), Number(slider.step)]).toEqual([lower, upper, step]);
    });
  });

  it('hides the nail controls for adhesive and shows the glue pad', async () => {
    const { store, user } = setup();
    for (const name of ['Nail shaft', 'Nail head', 'Head height', 'Nail gap from the strap']) expect(field(name)).toBeTruthy();
    expect(screen.getByText(/^The plate runs on past the strap/)).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: 'Adhesive' }));
    expect(store.getState().parameters.mount).toBe('adhesive');
    for (const name of ['Nail shaft', 'Nail head', 'Head height', 'Nail gap from the strap']) expect(field(name)).toBeNull();
    expect(screen.getByText(/^No extension and no hole/)).toBeTruthy();

    const c = core.clip.clip(store.getState().parameters);
    expect(
      screen.getByText(`The plate is ${number02(c.halfWidth + c.edgeX)} mm wide under the strap and ${number02(c.length)} mm long, about ${Math.round(c.padArea)} mm² of glue pad.`),
    ).toBeTruthy();
  });

  it('reads the nail readout from the derived fields', () => {
    const { store } = setup();
    const p = store.getState().parameters, c = core.clip.clip(p);
    expect(
      screen.getByText(
        `The plate runs ${number02(c.plateEnd - p.length / 2)} mm past the strap on one side. The head's counterbore, ${number02(c.counterbore)} mm wide and ${number02(c.counterboreDepth)} mm deep, starts ${number02(c.nailY! - c.counterbore / 2 - p.length / 2)} mm past the strap: that is the room the hammer or a nail punch has. The whole clip is ${number02(c.length)} mm long.`,
      ),
    ).toBeTruthy();
    expect(screen.getByText(new RegExp(`passage between the tip and the plate's edge is ${number02(c.opening)} mm`))).toBeTruthy();
  });

  it('explains a plate grown for a tall nail head', () => {
    const { store } = setup({ nailHeadHeight: 2, plate: 1.5 });
    const c = core.clip.clip(store.getState().parameters);
    expect(c.plateThickness).toBeGreaterThan(1.5);
    expect(screen.getByText(`The plate is ${number02(c.plateThickness)} mm here: at least 0.6 mm thicker than the nail head, so the head sinks in flush.`)).toBeTruthy();
  });

  it('does not explain the plate when it is as set', () => {
    setup();
    expect(screen.queryByText(/at least 0\.6 mm thicker/)).toBeNull();
  });

  it('disables export and warns on a problem', async () => {
    const { store, onExport, user } = setup(blocked);
    const problem = core.clip.clip(store.getState().parameters).problem!;
    expect(problem).toMatch(/too small/);
    expect(screen.getByTestId('clipProblem').textContent).toBe(problem);
    expect(screen.getByTestId('clipProblem').dataset.tone).toBe('warning');
    expect(screen.getByTestId('clipProblem').querySelector('[data-symbol="exclamationmark.triangle"]')).toBeTruthy();

    const button = screen.getByTestId<HTMLButtonElement>('exportCableClip');
    expect(button.disabled).toBe(true);
    expect(button.className).toContain('fc-export--blocked');
    await user.click(button);
    expect(onExport).not.toHaveBeenCalled();

    await user.click(screen.getByRole('radio', { name: 'Adhesive' }));
    expect(screen.getByTestId<HTMLButtonElement>('exportCableClip').disabled).toBe(false);
    expect(screen.queryByTestId('clipProblem')).toBeNull();
  });

  it('shows a note with the info icon when there is no problem', () => {
    const { store } = setup({ cableDiameter: 2, overlap: 1.5 });
    const c = core.clip.clip(store.getState().parameters);
    expect(c.problem).toBeNull();
    expect(c.note).not.toBeNull();
    const note = screen.getByTestId('clipNote');
    expect(note.textContent).toBe(c.note);
    expect(note.dataset.tone).toBe('secondary');
    expect(note.querySelector('[data-symbol="info.circle"]')).toBeTruthy();
  });

  it('colors the strain by the 2.2 % limit', () => {
    const { store } = setup({ wall: 0.6, cableDiameter: 6, overlap: 0.3 });
    const relaxed = core.clip.clip(store.getState().parameters);
    expect(relaxed.snapStrain).toBeLessThanOrEqual(0.022);
    const label = screen.getByTestId('clipStrain');
    expect(label.dataset.tone).toBe('accent');
    expect(label.querySelector('[data-symbol="arrow.up.and.down"]')).toBeTruthy();
    expect(label.textContent).toBe(`Strain about ${number02(relaxed.snapStrain * 100)} % as the cable goes in · PLA takes about 2 %, PETG more`);

    act(() => store.getState().apply({ ...store.getState().parameters, wall: 1.2, cableDiameter: 2, overlap: 1.5 }));
    expect(core.clip.clip(store.getState().parameters).snapStrain).toBeGreaterThan(0.022);
    const tense = screen.getByTestId('clipStrain');
    expect(tense.dataset.tone).toBe('warning');
    expect(tense.querySelector('[data-symbol="exclamationmark.triangle"]')).toBeTruthy();
  });

  it('switches the print text and the print badge', async () => {
    const { store, user } = setup();
    expect(screen.getByText(/^Standing on the strap's end, the profile lies on the bed/)).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Print view' }));
    expect(screen.getByTestId('stageBadge').textContent).toBe("Standing on the strap's end · profile on the bed · brim");

    await user.click(checkbox('Print lying on the plate'));
    expect(store.getState().parameters.flat).toBe(true);
    expect(screen.getByText(/^Lying flat the plate is on the bed/)).toBeTruthy();
    expect(screen.getByTestId('stageBadge').textContent).toBe('Lying on the plate · arch bridged · no supports');
  });

  it('labels the toggle Wall or Build plate, and the assembled view passes its colors', async () => {
    const { store, finishPreview, user } = setup();
    await finishPreview();
    const bundle = store.getState().bundle!;
    expect(screen.getByTestId('stageBadge').textContent).toBe('On the wall · press the cable in from the open side');
    expect(checkbox('Wall')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Build plate' })).toBeNull();
    expect(stage.props).toMatchObject({
      mesh: bundle.assemblyMesh,
      faceColors: bundle.assemblyMesh.faceColors,
      geometryKey: '1:assembled',
      minimumScale: 14,
      compactObject: true,
      objectName: 'cable clip',
      sharpEdges: true,
      smoothAngle: Math.PI / 5,
    });
    expect(stage.props!.detailColor).toEqual(stage.props!.color);

    await user.click(screen.getByRole('radio', { name: 'Print view' }));
    expect(checkbox('Build plate')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Wall' })).toBeNull();
    expect(stage.props).toMatchObject({ mesh: bundle.printMesh, geometryKey: '1:print', minimumScale: 10 });
    expect(stage.props!.faceColors).toBeUndefined();
  });

  it('keeps the preview selector under its Swift test id', () => {
    setup();
    expect(within(screen.getByTestId('cableClipPreviewPart')).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['On the wall', 'Print view']);
  });

  it('switches face and angled view; reset goes back to angled', async () => {
    const { user } = setup();
    const camera = stage.props!.resetCamera;
    await user.click(screen.getByRole('button', { name: 'Face view' }));
    expect(stage.props!.topDown).toBe(true);
    expect(stage.props!.resetCamera).toBe(camera);
    await user.click(screen.getByRole('button', { name: 'Angled view' }));
    await user.click(screen.getByRole('button', { name: 'Face view' }));
    await user.click(screen.getByRole('button', { name: 'Reset clip camera' }));
    expect(stage.props!.topDown).toBe(false);
    expect(stage.props!.resetCamera).toBe(camera + 1);
  });

  it('names its five swatches', async () => {
    const { user } = setup();
    for (const name of ['Linen', 'Wall white', 'Black', 'Grey', 'Sage']) expect(screen.getByTitle(`${name} · preview only`)).toBeTruthy();
    expect(screen.getByText('Colour · preview only')).toBeTruthy();
    const before = stage.props!.color;
    await user.click(screen.getByTitle('Sage · preview only'));
    expect(stage.props!.color).not.toEqual(before);
    expect(stage.props!.detailColor).toEqual(stage.props!.color);
  });

  it('shows the metrics of the finished kit with up to two decimals', async () => {
    const { store, finishPreview } = setup();
    await finishPreview();
    const { clip: c, parameters: p } = store.getState().bundle!;
    expect(metric('SIZE')).toBe(`SIZE${number02(c.width)} × ${number02(c.length)} × ${number02(c.height)}mm`);
    expect(metric('OPENING')).toBe(`OPENING${number02(c.opening)} · lifts ${number02(c.insertion)}mm`);
    expect(metric('BEYOND THE CABLE')).toBe(`BEYOND THE CABLE+${number02(c.width - p.cableDiameter)} wide · +${number02(c.height - p.cableDiameter)} tallmm`);
    expect(screen.getByText('Cable clip · Ø 3.75 mm')).toBeTruthy();
    expect(screen.getByText('Live preview')).toBeTruthy();
  });

  it('exports the snapshot of beginExport', async () => {
    const { store, onExport, user } = setup();
    await user.click(screen.getByTestId('exportCableClip'));
    expect(onExport).toHaveBeenCalledWith(store.getState().parameters);
  });

  it('shows Preparing and the saved line', () => {
    const { store } = setup();
    expect(screen.getByText('One STL · print orientation · millimetres')).toBeTruthy();
    act(() => store.getState().setExporting(true));
    const button = screen.getByTestId<HTMLButtonElement>('exportCableClip');
    expect(button.textContent).toContain('Preparing clip…');
    expect(button.disabled).toBe(true);
    act(() => {
      store.getState().setExporting(false);
      store.getState().setExported({ filename: 'Cable-Clip-3.75mm.stl', mode: 'downloaded' });
    });
    expect(screen.getByRole('status').textContent).toBe('Downloaded · Cable-Clip-3.75mm.stl');
    expect(screen.getByTestId('exportCableClip').textContent).toContain('Export Clip STL…');
  });

  it('shows and dismisses the export failure', async () => {
    const { store, user } = setup();
    act(() => store.getState().setError('Disk full'));
    const alert = screen.getByRole('alertdialog', { name: 'Clip export failed' });
    await user.click(within(alert).getByRole('button', { name: 'OK' }));
    expect(store.getState().error).toBeNull();
  });

  it('has the Mac advice row', () => {
    setup();
    expect(screen.getByText('Nail the plate, then press the cable in from the open side')).toBeTruthy();
    expect(screen.getByText(/The spring is not yet confirmed in print\.$/)).toBeTruthy();
  });
});
