// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core';
import type { CloudParameters, CloudPreview, WallLampKind } from '../../core/types';
import type { StageProps } from '../../preview';
import { createCloudStore } from '../../stores/cloudStore';
import { testDeps } from '../../stores/testKit';
import { CLAMP_COLOR } from './presentation';
import { CloudEditorView } from './CloudEditorView';

let stage: StageProps;
vi.mock('../../preview', async (original) => ({
  ...(await original<typeof import('../../preview')>()),
  Stage: (props: StageProps) => {
    stage = props;
    return <div data-testid="stage" />;
  },
}));

/** A store on fakes whose preview answers at once from the stub core, with `patch` on top. */
const setup = async (kind: WallLampKind, change: Partial<CloudParameters> = {}, patch: Partial<CloudPreview> = {}) => {
  const { deps, commitEditing } = testDeps();
  const previewClient = {
    preview: async (_part: string, input: unknown) => ({ status: 'current', value: { ...core.cloud.preview(input as CloudParameters), ...patch } }),
  } as unknown as typeof deps.previewClient;
  const store = createCloudStore(kind, { ...deps, previewClient });
  if (Object.keys(change).length > 0) store.getState().apply({ ...store.getState().parameters, ...change });
  render(<CloudEditorView store={store} />);
  await settle(store);
  return { store, commitEditing, user: userEvent.setup() };
};

const settle = async (store: ReturnType<typeof createCloudStore>) => {
  // Instant on the stub; a sculpted sun on the real core takes seconds on a CI runner.
  await vi.waitFor(() => expect(store.getState().updating).toBe(false), { timeout: 30_000 });
  await act(async () => {});
};

const cards = (prefix: string) => screen.getAllByRole('button').filter((button) => button.dataset.testid?.startsWith(prefix));
const checkbox = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const radios = (id: string) => within(screen.getByTestId(id)).getAllByRole('radio').map((radio) => radio.textContent);
const setNumber = (title: string, value: string) => {
  const field = screen.getByRole('textbox', { name: title });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};

beforeEach(() => {
  stage = undefined as unknown as StageProps;
});

describe('shape chooser', () => {
  it('sun: four cards, the diameter and no mirror', async () => {
    await setup('sun');
    expect(cards('sunStyle-').map((card) => card.dataset.testid)).toEqual(['sunStyle-soft-star', 'sunStyle-cones', 'sunStyle-pinwheel', 'sunStyle-bold-eight']);
    expect(screen.getByRole('textbox', { name: 'Diameter including rays' })).toBeTruthy();
    expect(screen.queryByTestId('cloudMirror')).toBeNull();
    expect(screen.getByText('FOUR WAYS TO SHINE')).toBeTruthy();
    expect(screen.getByText('SUN & DIFFUSER')).toBeTruthy();
    expect(screen.getByText('Twelve plump rays that flow into the dome')).toBeTruthy();
  });

  it('cloud: six cards, the width and the mirror', async () => {
    const { store, user } = await setup('cloud');
    expect(cards('cloudStyle-').map((card) => card.dataset.testid)).toEqual(['classic', 'drift', 'billow', 'twin', 'breeze', 'cotton'].map((style) => `cloudStyle-${style}`));
    expect(screen.getByRole('textbox', { name: 'Cloud width' })).toBeTruthy();
    await user.click(checkbox('cloudMirror'));
    expect(store.getState().parameters.mirrored).toBe(true);
  });

  it('marks the selected card and picks another', async () => {
    const { store, user } = await setup('cloud');
    expect(screen.getByTestId('cloudStyle-classic').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('cloudStyle-classic').getAttribute('aria-label')).toBe('Classic cloud, Soft & familiar');
    await user.click(screen.getByTestId('cloudStyle-twin'));
    expect(store.getState().parameters.style).toBe('twin');
    expect(screen.getByTestId('cloudStyle-twin').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('cloudStyle-classic').getAttribute('aria-pressed')).toBe('false');
  });

  it('silhouettes render without NaN', async () => {
    await setup('sun');
    const paths = [...document.querySelectorAll('.cloud-card__shape path')].map((path) => path.getAttribute('d') ?? '');
    expect(paths).toHaveLength(4);
    for (const d of paths) {
      expect(d.length).toBeGreaterThan(100);
      expect(d).not.toContain('NaN');
    }
  });
});

describe('dimensions', () => {
  it('flat hides the surface depth, 3D surface shows it', async () => {
    const { store, user } = await setup('cloud');
    expect(screen.queryByRole('textbox', { name: 'Surface depth' })).toBeNull();
    await user.click(within(screen.getByTestId('cloudSurface')).getByRole('radio', { name: '3D surface' }));
    expect(store.getState().parameters.surface).toBe('sculpted');
    expect(screen.getByRole('textbox', { name: 'Surface depth' })).toBeTruthy();
    expect(screen.getByText(/Separate puffs, rounded from the outline up/)).toBeTruthy();
    expect(screen.getByText(/Print curved face up, clips down/)).toBeTruthy();
  });

  it('a sculpted sun names its design', async () => {
    await setup('sun', { surface: 'sculpted', sunStyle: 'pinwheel' });
    expect(screen.getByText('Twelve leaning rays that swirl into the middle, rising from the outline. Hollow inside for light.')).toBeTruthy();
  });

  it('warns above the bed and offers 240 mm', async () => {
    const { store, user } = await setup('cloud');
    expect(screen.queryByText('This width exceeds the P2S bed with an 8 mm brim.')).toBeNull();
    expect(screen.getByTestId('cloudFit').textContent).toBe('All pieces fit P2S + 8 mm brim');
    setNumber('Cloud width', '240');
    expect(screen.queryByText('This width exceeds the P2S bed with an 8 mm brim.')).toBeNull();
    setNumber('Cloud width', '241');
    await settle(store);
    expect(screen.getByText('This width exceeds the P2S bed with an 8 mm brim.')).toBeTruthy();
    expect(screen.getByTestId('cloudFit').textContent).toBe('Exceeds P2S bed · reduce cloud width');
    await user.click(screen.getByRole('button', { name: 'Use 240 mm for the P2S' }));
    expect(store.getState().parameters.width).toBe(240);
    expect(screen.queryByText('This width exceeds the P2S bed with an 8 mm brim.')).toBeNull();
  });

  it('uses the Swift ranges', async () => {
    await setup('sun', { nailInsert: true, surface: 'sculpted' });
    const range = (title: string) => {
      const slider = screen.getByRole('slider', { name: `${title} slider` }) as HTMLInputElement;
      return [Number(slider.min), Number(slider.max), Number(slider.step)];
    };
    expect(range('Diameter including rays')).toEqual([160, 500, 1]);
    expect(range('Back depth')).toEqual([16, 40, 1]);
    expect(range('Diffuser thickness')).toEqual([0.8, 2, 0.2]);
    expect(range('Surface depth')).toEqual([2, 24, 0.5]);
    expect(range('Strip width')).toEqual([3.5, 12, 0.5]);
    expect(range('Strip thickness incl. LEDs')).toEqual([1, 6, 0.5]);
    expect(range('Distance between cut marks')).toEqual([5, 100, 0.1]);
    expect(range('LED row spacing')).toEqual([12, 40, 0.5]);
    expect(range('Clip fit allowance')).toEqual([0.2, 0.5, 0.05]);
    expect(range('Nail head clearance')).toEqual([5, 10, 0.5]);
    expect(range('Nail shaft clearance')).toEqual([2, 5, 0.5]);
    expect(range('Measured nail shaft')).toEqual([1, 4, 0.1]);
    expect(range('Measured nail head')).toEqual([2, 8, 0.1]);
    expect(range('Cable diameter')).toEqual([2, 6, 0.5]);
  });

  it('the shaft range follows the head, the row spacing the strip', async () => {
    await setup('cloud', { nailHead: 6, stripWidth: 10 });
    expect((screen.getByRole('slider', { name: 'Nail shaft clearance slider' }) as HTMLInputElement).max).toBe('4');
    expect((screen.getByRole('slider', { name: 'LED row spacing slider' }) as HTMLInputElement).min).toBe('14');
  });
});

describe('LED panel', () => {
  it('reads the plan', async () => {
    await setup('cloud', {}, { ledPlan: { sections: [{ x: 0, y: 0, length: 80 }, { x: 0, y: 14, length: 64 }], totalLength: 144.25, nominalWatts: 3.46, rowCount: 2 } });
    expect(screen.getByText('2 straight sections · 144.2 mm of strip. Flat adhesive mounting with room for wire links.')).toBeTruthy();
    expect(screen.getByText(/^Aclorol estimate: 3.5 W at full power\./)).toBeTruthy();
    expect(screen.getByText('Minimum LED-to-front gap: 16 mm. Start with a 22 mm back; test row spacing behind your printed front.')).toBeTruthy();
    expect(screen.queryByText(/No complete section fits/)).toBeNull();
  });

  it('warns when no section fits', async () => {
    await setup('sun', {}, { ledPlan: { sections: [], totalLength: 0, nominalWatts: 0, rowCount: 0 } });
    expect(screen.getByText('No complete section fits. Enlarge the sun or use a strip with closer cut marks.')).toBeTruthy();
  });

  it('View LED placement shows the inside from the front', async () => {
    const { user } = await setup('cloud');
    expect((screen.getByTestId('cloudPreviewPart') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Exploded');
    expect(stage.topDown).toBe(false);
    const before = stage.resetCamera;
    await user.click(screen.getByTestId('cloudLEDLayout'));
    expect((screen.getByTestId('cloudPreviewPart') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Back · inside');
    expect(stage.topDown).toBe(true);
    expect(stage.resetCamera).toBe(before + 1);
    expect(stage.geometryKey.endsWith(':back')).toBe(true);
    expect(screen.getByTestId('cloudPreviewCaption').textContent).toMatch(/^Green: LED guides · orange: seals/);
  });
});

describe('wall mount', () => {
  it('shows the insert text and its view when the insert suits', async () => {
    const { user } = await setup('cloud', { nailInsert: true });
    expect(screen.getByText(/It narrows the slot to 2.2 mm, and the head bears on its plate. Set the head's underside 3.5–3.8 mm off the wall\.$/)).toBeTruthy();
    await user.click(screen.getByTestId('cloudViewNailInsert'));
    expect((screen.getByTestId('cloudPreviewPart') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Slot insert · print view');
  });

  it('shows the problem through the API when it does not', async () => {
    await setup('sun', { nailInsert: true, nailDiameter: 4 });
    expect(screen.getByText('A 4.0 mm shaft is too thick for the insert to narrow the 3.5 mm slot. The kit comes without it.')).toBeTruthy();
    expect(screen.queryByTestId('sunViewNailInsert')).toBeNull();
  });

  it('hides everything without the insert', async () => {
    await setup('cloud');
    expect(screen.queryByRole('textbox', { name: 'Measured nail shaft' })).toBeNull();
  });
});

describe('cable outlets', () => {
  it('one outlet: only the second toggle, with its name and no picker', async () => {
    await setup('cloud');
    expect(radios('cloudCableSide')).toEqual(['Left', 'Right', 'Top', 'Bottom']);
    expect(checkbox('cloudSecondCableOutlet').checked).toBe(false);
    expect(screen.queryByTestId('cloudThirdCableOutlet')).toBeNull();
    expect(screen.queryByTestId('cloudSecondCableSide')).toBeNull();
    expect(screen.getByText('Second cable outlet')).toBeTruthy();
  });

  it('two outlets: the second picker offers the three sides not taken before it', async () => {
    const { store, user } = await setup('cloud');
    await user.click(checkbox('cloudSecondCableOutlet'));
    expect(core.cloud.derived(store.getState().parameters).cableSides).toEqual(['right', 'left']);
    expect(radios('cloudSecondCableSide')).toEqual(['Left', 'Top', 'Bottom']);
    expect(checkbox('cloudThirdCableOutlet').checked).toBe(false);
    expect(screen.queryByTestId('cloudFourthCableOutlet')).toBeNull();
    await user.click(within(screen.getByTestId('cloudSecondCableSide')).getByRole('radio', { name: 'Top' }));
    expect(core.cloud.derived(store.getState().parameters).cableSides).toEqual(['right', 'top']);
  });

  it('three outlets: the third picker has two sides, the fourth toggle names the last', async () => {
    const { store, user } = await setup('cloud');
    await user.click(checkbox('cloudSecondCableOutlet'));
    await user.click(checkbox('cloudThirdCableOutlet'));
    expect(core.cloud.derived(store.getState().parameters).cableSides).toEqual(['right', 'left', 'bottom']);
    expect(radios('cloudThirdCableSide')).toEqual(['Top', 'Bottom']);
    expect(screen.getByText('Fourth cable outlet · Top')).toBeTruthy();
    expect(screen.queryByTestId('cloudFourthCableSide')).toBeNull();
  });

  it('four outlets: no further toggle; turning one off drops it and the ones after it', async () => {
    const { store, user } = await setup('sun');
    await user.click(checkbox('sunSecondCableOutlet'));
    await user.click(checkbox('sunThirdCableOutlet'));
    await user.click(checkbox('sunFourthCableOutlet'));
    expect(core.cloud.derived(store.getState().parameters).cableSides).toHaveLength(4);
    expect(screen.getByText('Fourth cable outlet · Top')).toBeTruthy();
    expect(screen.getByText('Cable exits: Right, Left, Bottom and Top. Left and right are as you face the lamp. The back sits flat on the wall.')).toBeTruthy();
    await user.click(checkbox('sunSecondCableOutlet'));
    expect(core.cloud.derived(store.getState().parameters).cableSides).toEqual(['right']);
    expect(screen.queryByTestId('sunThirdCableOutlet')).toBeNull();
  });

  it('moving the first outlet onto another outlet swaps them', async () => {
    const { store, user } = await setup('cloud');
    await user.click(checkbox('cloudSecondCableOutlet'));
    await user.click(within(screen.getByTestId('cloudCableSide')).getByRole('radio', { name: 'Left' }));
    expect(core.cloud.derived(store.getState().parameters).cableSides).toEqual(['left', 'right']);
  });
});

describe('seal and clamp', () => {
  it('View cable seal selects its view, caption and framing', async () => {
    const { user } = await setup('cloud');
    await user.click(screen.getByTestId('cloudCableSeal'));
    expect(screen.getByTestId('cloudPreviewCaption').textContent).toBe('Black TPU · flat end down, nozzle up · no supports');
    expect(stage.minimumScale).toBe(9);
    expect(stage.color).toEqual([0.2, 0.2, 0.2]);
    expect(stage.topDown).toBe(false);
  });

  it('shows the clamp text and button while a clamp fits', async () => {
    const { user } = await setup('cloud', {}, { clampCount: 1, cableCount: 1, cablesWithoutClamp: [] });
    expect(screen.getByText(/^Each clamp has two posts behind its seal/)).toBeTruthy();
    await user.click(screen.getByTestId('cloudCableClamp'));
    expect(screen.getByTestId('cloudPreviewCaption').textContent).toBe('Bar on its side, anvil flat · 2 screws M3 × 10');
    expect(stage.color).toEqual(CLAMP_COLOR);
    expect(stage.minimumScale).toBe(16);
  });

  it('explains a missing clamp', async () => {
    await setup('cloud', { width: 125 }, { clampCount: 0, cableCount: 1, cablesWithoutClamp: ['right'] });
    expect(screen.getByText(/^No room for the clamp behind this outlet/)).toBeTruthy();
    expect(screen.queryByTestId('cloudCableClamp')).toBeNull();
  });

  it('names outlets without a clamp', async () => {
    await setup('cloud', { secondCableSide: 'left' }, { clampCount: 1, cableCount: 2, cablesWithoutClamp: ['left'] });
    expect(screen.getByText('No room for a clamp at Left. This outlet keeps its seal; secure its lead outside the lamp.')).toBeTruthy();
  });

  it('no relief, no note', async () => {
    const { store, user } = await setup('cloud', {}, { clampCount: 0, cableCount: 1, cablesWithoutClamp: ['right'] });
    expect(screen.getByText(/^No room for the clamp/)).toBeTruthy();
    await user.click(checkbox('cloudStrainRelief'));
    expect(store.getState().parameters.strainRelief).toBe(false);
    expect(screen.queryByText(/^No room for the clamp/)).toBeNull();
  });
});

describe('export footer', () => {
  it('labels and names the kit per kind', async () => {
    const { store, user } = await setup('sun');
    expect(screen.getByTestId('exportSun').textContent).toContain('Export Sun Kit…');
    expect(screen.queryByTestId('sunExportMessage')).toBeNull();
    await user.click(screen.getByTestId('exportSun'));
    expect(screen.getByTestId('sunExportMessage').textContent).toBe(`Sun-Lamp-soft-star-200mm-kit.zip · ${store.getState().bundle?.printedParts} print-ready STLs, a full-size LED placement plan, cut list and assembly notes.`);
  });

  it('the cloud too, and a change clears the message', async () => {
    const { store, user } = await setup('cloud');
    expect(screen.getByTestId('exportCloud').textContent).toContain('Export Cloud Kit…');
    await user.click(screen.getByTestId('exportCloud'));
    expect(screen.getByTestId('cloudExportMessage').textContent).toMatch(/^Cloud-Lamp-230mm-kit\.zip · /);
    await user.click(screen.getByTestId('cloudStyle-drift'));
    expect(store.getState().parameters.style).toBe('drift');
    expect(screen.queryByTestId('cloudExportMessage')).toBeNull();
  });

  it('commits the field being edited and hands the request to onExport', async () => {
    const { deps, commitEditing } = testDeps();
    const store = createCloudStore('cloud', deps);
    const onExport = vi.fn();
    render(<CloudEditorView store={store} onExport={onExport} />);
    fireEvent.click(screen.getByTestId('exportCloud'));
    expect(commitEditing).toHaveBeenCalled();
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Cloud-Lamp-230mm-kit.zip', title: 'Export Cloud Lamp Kit', prompt: 'Export Kit' }));
  });

  it('shows Exporting… and blocks a second export', async () => {
    const { store } = await setup('cloud');
    act(() => store.getState().setExporting(true));
    const button = screen.getByTestId('exportCloud') as HTMLButtonElement;
    expect(button.textContent).toContain('Exporting…');
    expect(button.disabled).toBe(true);
  });

  it('shows the parts line, then the saved or downloaded line', async () => {
    const { store } = await setup('sun', {}, { printedParts: 7 });
    expect(screen.getByText('ZIP · 7 STLs + LED plan + assembly notes')).toBeTruthy();
    act(() => store.getState().setExported({ filename: 'Sun.zip', mode: 'saved' }));
    expect(screen.getByText('Sun saved · Sun.zip')).toBeTruthy();
    expect(screen.queryByText(/^ZIP · /)).toBeNull();
    act(() => store.getState().setExported({ filename: 'Sun.zip', mode: 'downloaded' }));
    expect(screen.getByText('Sun downloaded · Sun.zip')).toBeTruthy();
  });

  it('reports a failure in an alert', async () => {
    const { store, user } = await setup('sun');
    act(() => store.getState().setError('The disk is full.'));
    const alert = screen.getByTestId('sunExportFailed');
    expect(within(alert).getByText('Sun export failed')).toBeTruthy();
    expect(within(alert).getByText('The disk is full.')).toBeTruthy();
    await user.click(within(alert).getByRole('button', { name: 'OK' }));
    expect(store.getState().error).toBeNull();
  });
});

describe('preview', () => {
  const pick = (kind: string, label: string) => {
    const select = screen.getByTestId(`${kind}PreviewPart`) as HTMLSelectElement;
    const option = [...select.options].find((candidate) => candidate.textContent === label)!;
    fireEvent.change(select, { target: { value: option.value } });
  };

  it('offers the eight views, Exploded first selected', async () => {
    await setup('cloud');
    const select = screen.getByTestId('cloudPreviewPart') as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(['Assembled', 'Exploded', 'Back · inside', 'Back · wall side', 'Front · print view', 'Cable seal · print view', 'Cable clamp · print view', 'Slot insert · print view']);
    expect(select.selectedOptions[0]?.textContent).toBe('Exploded');
    expect(select.getAttribute('aria-label')).toBe('Cloud view');
  });

  it('passes the Stage what CloudEditor.swift:409-416 passes', async () => {
    const { store } = await setup('sun', { surface: 'sculpted' });
    const kit = store.getState().bundle!;
    expect(stage.mesh).toBe(kit.views.exploded);
    expect(stage.faceColors).toBe(kit.views.exploded.faceColors);
    expect(stage.geometryKey).toBe(`${store.getState().revision}:exploded`);
    expect(stage).toMatchObject({ compactObject: true, sharpEdges: true, cutaway: false, inspectOpening: false, neckDiameter: 0, objectName: 'sun lamp', minimumScale: 32, showPlate: false });
    expect(stage.smoothAngle).toBeCloseTo(Math.PI / 5);
  });

  it('a flat lamp has no smoothing, and print views have no assigned colors', async () => {
    const { store } = await setup('cloud');
    expect(stage.smoothAngle).toBe(0);
    pick('cloud', 'Front · print view');
    expect(stage.mesh).toBe(store.getState().bundle!.views.front);
    expect(stage.faceColors).toBeUndefined();
    expect(stage.color).toEqual([0.96, 0.96, 0.96]);
  });

  it('hides the build plate in assembly views; it stays off by default', async () => {
    const { user } = await setup('cloud');
    expect(screen.queryByTestId('cloudBuildPlate')).toBeNull();
    pick('cloud', 'Assembled');
    expect(screen.queryByTestId('cloudBuildPlate')).toBeNull();
    pick('cloud', 'Front · print view');
    expect(checkbox('cloudBuildPlate').checked).toBe(false);
    await user.click(checkbox('cloudBuildPlate'));
    expect(stage.showPlate).toBe(true);
    pick('cloud', 'Exploded');
    expect(stage.showPlate).toBe(false);
    expect(screen.queryByTestId('cloudBuildPlate')).toBeNull();
  });

  it('views look at the face where Swift does and reframe', async () => {
    await setup('cloud');
    const reset = () => stage.resetCamera;
    for (const [label, topDown] of [['Assembled', true], ['Back · inside', true], ['Back · wall side', true], ['Front · print view', false], ['Exploded', false]] as const) {
      const before = reset();
      pick('cloud', label);
      expect(stage.topDown).toBe(topDown);
      expect(reset()).toBe(before + 1);
    }
  });

  it('Face/Angled toggles, Reset goes back to angled', async () => {
    const { user } = await setup('sun');
    const toggle = screen.getByTestId('sunFaceView');
    expect(toggle.textContent).toContain('Face view');
    await user.click(toggle);
    expect(stage.topDown).toBe(true);
    expect(toggle.textContent).toContain('Angled view');
    const before = stage.resetCamera;
    await user.click(screen.getByRole('button', { name: 'Reset sun camera' }));
    expect(stage.topDown).toBe(false);
    expect(stage.resetCamera).toBe(before + 1);
  });

  it('frames again when a finished preview has another shape, not on the first one', async () => {
    const { store, user } = await setup('cloud');
    expect(stage.resetCamera).toBe(0);
    await user.click(screen.getByTestId('cloudStyle-drift'));
    expect(stage.resetCamera).toBe(0);
    await settle(store);
    expect(stage.resetCamera).toBe(1);
    await user.click(checkbox('cloudMirror'));
    await settle(store);
    expect(stage.resetCamera).toBe(2);
    await user.click(checkbox('cloudSecondCableOutlet'));
    await settle(store);
    expect(stage.resetCamera).toBe(3);
    setNumber('Back depth', '30');
    await settle(store);
    expect(stage.resetCamera).toBe(3);
  });

  it('a new surface leaves the face view', async () => {
    const { store, user } = await setup('cloud');
    await user.click(screen.getByTestId('cloudFaceView'));
    expect(stage.topDown).toBe(true);
    await user.click(within(screen.getByTestId('cloudSurface')).getByRole('radio', { name: '3D surface' }));
    await settle(store);
    expect(stage.topDown).toBe(false);
  });

  // `Updating…` lasts one debounce of real time, which a loaded machine can spend inside `user.click`. Retried for that.
  it('shows metrics, status and name', { retry: 3 }, async () => {
    const { store, user } = await setup('sun');
    const metrics = within(screen.getByTestId('sunMetrics'));
    expect(metrics.getByText('SUN SIZE')).toBeTruthy();
    expect(metrics.getByText('200 × 200')).toBeTruthy();
    expect(metrics.getByText('ASSEMBLED DEPTH')).toBeTruthy();
    expect(metrics.getByText('23.2')).toBeTruthy();
    expect(metrics.getByText('DIFFUSER')).toBeTruthy();
    expect(screen.getByText('Sun · Soft star')).toBeTruthy();
    expect(screen.getByText('Live preview')).toBeTruthy();
    await user.click(screen.getByTestId('sunStyle-cones'));
    expect(screen.getByText('Updating…')).toBeTruthy();
    await settle(store);
    expect(screen.getByText('Live preview')).toBeTruthy();
  });

  it('cloud metrics and closing lines', async () => {
    await setup('cloud');
    const metrics = within(screen.getByTestId('cloudMetrics'));
    expect(metrics.getByText('CLOUD SIZE')).toBeTruthy();
    expect(metrics.getByText('WHITE FACE')).toBeTruthy();
    expect(screen.getByText('Light through the cloud. Openings hidden behind it.')).toBeTruthy();
    expect(screen.getByText('Prototype · clip fit, mounting strength, opacity and LED heat need a physical check.')).toBeTruthy();
  });
});

describe('before the first preview', () => {
  it('renders without a bundle and asks for one', () => {
    const { deps, preview } = testDeps();
    const store = createCloudStore('sun', deps);
    render(<CloudEditorView store={store} />);
    expect(stage.mesh).toBeNull();
    expect(screen.getByText('Updating…')).toBeTruthy();
    expect(screen.getByText('ZIP · 5 STLs + LED plan + assembly notes')).toBeTruthy();
    expect(screen.queryByTestId('sunPreviewCaption')).toBeNull();
    expect(preview.calls).toHaveLength(1);
  });
});

describe('guide', () => {
  it('opens the instructions in a sheet and closes with Done', async () => {
    const { user } = await setup('sun', {}, { instructions: 'Line one\n  Line two' });
    expect(screen.queryByText(/Line one/)).toBeNull();
    await user.click(screen.getByTestId('sunAssemblyGuide'));
    const sheet = screen.getByTestId('sunGuideSheet');
    expect(within(sheet).getByRole('heading', { name: 'Sun lamp · printing & assembly' })).toBeTruthy();
    expect(sheet.querySelector('.cloud-guide')?.textContent).toBe('Line one\n  Line two');
    expect((sheet as HTMLElement).style.width).toContain('700px');
    expect((sheet as HTMLElement).style.height).toContain('650px');
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.queryByText(/Line one/)).toBeNull();
  });
});

describe('default export', () => {
  it('gives each kind its own state', async () => {
    vi.resetModules();
    const { deps } = testDeps();
    const previewClient = { preview: async (_part: string, input: unknown) => ({ status: 'current', value: core.cloud.preview(input as CloudParameters) }) } as unknown as typeof deps.previewClient;
    const cloudStore = createCloudStore('cloud', { ...deps, previewClient });
    const sunStore = createCloudStore('sun', { ...deps, previewClient });
    vi.doMock('../../stores', () => ({ useCloudStore: cloudStore, useSunStore: sunStore }));
    const { default: CloudEditor } = await import('.');
    const { rerender } = render(<CloudEditor kind="cloud" />);
    await settle(cloudStore);
    expect(screen.getByTestId('cloudEditor')).toBeTruthy();
    fireEvent.click(screen.getByTestId('cloudLEDLayout'));
    rerender(<CloudEditor kind="sun" />);
    await settle(sunStore);
    expect(screen.getByTestId('sunEditor')).toBeTruthy();
    expect((screen.getByTestId('sunPreviewPart') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Exploded');
    vi.doUnmock('../../stores');
  });
});
