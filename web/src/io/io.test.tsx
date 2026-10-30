// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core/parameters';
import { App } from '../app/App';
import { CoreFailure, STL_ERRORS } from '../core/api';
import type { ExportResult, ImportedBalloon } from '../core/types';
import {
  ioClient,
  resetStudio,
  useAppStore,
  useBalloonStore,
  useBasketStore,
  useClipStore,
  useCloudStore,
  useFigureStore,
  useImportStore,
  useRingStore,
  useSunStore,
} from '../test/studioMock';
import type { PartKey } from '../worker/protocol';
import { cancelExport } from './exportFlow';
import { EXPORT_TABLE, exportedLine, type ExportVariant } from './exportTable';
import { startExport } from './index';

vi.mock('../stores', () => import('../test/studioMock'));
vi.mock('../preview/Stage', () => import('../test/studioMock'));

const BYTES = new Uint8Array([1, 2, 3, 4]);
const result = (filename: string): ExportResult => ({ filename, mime: 'model/stl', files: [{ name: filename, bytes: BYTES }] });

const exportMock = vi.fn(async (_part: PartKey, _input: unknown) => result('from-core.stl'));
Object.assign(ioClient, { export: exportMock });

const stores = {
  balloon: useBalloonStore,
  basket: useBasketStore,
  ring: useRingStore,
  cloud: useCloudStore,
  sun: useSunStore,
  figure: useFigureStore,
  clip: useClipStore,
};

type PickerWindow = Window & { showSaveFilePicker?: unknown };

const fakeHandle = (name: string, writeImpl: (bytes: unknown) => Promise<void> = async () => undefined) => {
  const writable = { write: vi.fn(writeImpl), close: vi.fn(async () => undefined), abort: vi.fn(async () => undefined) };
  return { handle: { name, createWritable: vi.fn(async () => writable) }, writable };
};

const installPicker = (impl: (options: { suggestedName: string; types: unknown[] }) => Promise<unknown>) => {
  const picker = vi.fn(impl);
  (window as PickerWindow).showSaveFilePicker = picker;
  return picker;
};

let anchors: { download: string; href: string }[] = [];

beforeEach(() => {
  resetStudio();
  cancelExport();
  exportMock.mockReset();
  exportMock.mockImplementation(async () => result('from-core.stl'));
  anchors = [];
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function record(this: HTMLAnchorElement) {
    anchors.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  delete (window as PickerWindow).showSaveFilePicker;
  vi.restoreAllMocks();
});

const settled = () => waitFor(() => expect(Object.values(stores).some((store) => store.getState().exporting)).toBe(false));

const panel = (name: string) => screen.getByRole('dialog', { name });

describe('the export panel', () => {
  it('shows the Mac’s strings with the file name to edit, then cancels without a trace', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    const dialog = panel('Export Balloon STL');
    expect(dialog.textContent).toContain('A closed, printable envelope in millimetres. Set walls and infill in your slicer.');
    const field = screen.getByTestId<HTMLInputElement>('exportFilename');
    const expected = core.balloon.filename(useBalloonStore.getState().parameters);
    expect(field.value).toBe(expected);
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, expected.length - '.stl'.length]);
    expect(within(dialog).getByRole('button', { name: 'Export STL' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Export Balloon STL' })).toBeNull();
    expect(exportMock).not.toHaveBeenCalled();
    expect(useBalloonStore.getState().exported).toBeNull();
  });

  it('Esc cancels', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    fireEvent.keyDown(screen.getByTestId('exportFilename'), { key: 'Escape' });
    expect(screen.queryByTestId('exportFilename')).toBeNull();
    expect(exportMock).not.toHaveBeenCalled();
  });

  it('takes the snapshot when it opens, with the field being edited committed', async () => {
    const user = userEvent.setup();
    render(<App />);
    const field = screen.getByRole('textbox', { name: 'Widest diameter' });
    await user.clear(field);
    await user.type(field, '150');
    fireEvent.click(screen.getByTestId('exportBalloon'));
    expect(useBalloonStore.getState().parameters.diameter).toBe(150);
    expect(screen.getByTestId<HTMLInputElement>('exportFilename').value).toBe(core.balloon.filename(useBalloonStore.getState().parameters));
    const snapshot = useBalloonStore.getState().parameters;
    fireEvent.click(screen.getByTestId('exportConfirm'));
    await settled();
    expect(exportMock.mock.calls[0]![1]).toMatchObject({ parameters: snapshot });
  });

  it('does not start while the part is exporting', () => {
    render(<App />);
    act(() => useBalloonStore.getState().setExporting(true));
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    expect(screen.queryByTestId('exportFilename')).toBeNull();
  });

  it('an empty name disables the prompt, Enter does nothing', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.click(screen.getByTestId('exportBalloon'));
    const field = screen.getByTestId('exportFilename');
    await user.clear(field);
    expect(screen.getByTestId<HTMLButtonElement>('exportConfirm').disabled).toBe(true);
    await user.type(field, '{Enter}');
    expect(screen.getByTestId('exportFilename')).toBeTruthy();
    expect(exportMock).not.toHaveBeenCalled();
  });
});

describe('Mod+E', () => {
  it.each([
    ['balloon', 'Balloon', 'Export Balloon STL'],
    ['basket', 'Basket', 'Export Basket STL'],
    ['ring', 'Ring', 'Export Mobile Ring STL'],
    ['cloud', 'Cloud', 'Export Cloud Lamp Kit'],
    ['sun', 'Sun', 'Export Sun Lamp Kit'],
    ['figure', 'Figures', 'Export Figure STL'],
    ['clip', 'Cable clip', 'Export Cable Clip'],
  ] as const)('%s opens its own panel and exports its own snapshot', async (part, tab, title) => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('radio', { name: tab }));
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    expect(panel(title)).toBeTruthy();
    await user.click(screen.getByTestId('exportConfirm'));
    await settled();
    expect(exportMock).toHaveBeenCalledTimes(1);
    const parameters = stores[part].getState().parameters;
    const input = part === 'figure' ? { parameters, variant: 'single' } : part === 'balloon' ? expect.objectContaining({ parameters }) : parameters;
    expect(exportMock).toHaveBeenCalledWith(part, input);
    expect(stores[part].getState().exported?.mode).toBe('downloaded');
  });
});

describe('the export buttons', () => {
  it.each([
    ['basket', 'Basket', 'exportBasket', 'Export Basket STL'],
    ['ring', 'Ring', 'exportRing', 'Export Mobile Ring STL'],
    ['cloud', 'Cloud', 'exportCloud', 'Export Cloud Lamp Kit'],
    ['sun', 'Sun', 'exportSun', 'Export Sun Lamp Kit'],
    ['figure', 'Figures', 'exportFigure', 'Export Figure STL'],
    ['figure', 'Figures', 'exportFigureSet', 'Export Figure Set'],
    ['clip', 'Cable clip', 'exportCableClip', 'Export Cable Clip'],
  ] as const)('%s: %s opens %s', async (_part, tab, testId, title) => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('radio', { name: tab }));
    await user.click(screen.getByTestId(testId));
    expect(panel(title)).toBeTruthy();
  });

  it('the figure set exports the set variant under the set’s name', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('radio', { name: 'Figures' }));
    await user.click(screen.getByTestId('exportFigureSet'));
    const parameters = useFigureStore.getState().parameters;
    expect(screen.getByTestId<HTMLInputElement>('exportFilename').value).toBe(core.figure.setFilename(parameters));
    await user.click(screen.getByTestId('exportConfirm'));
    await settled();
    expect(exportMock).toHaveBeenCalledWith('figure', { parameters, variant: 'set' });
    expect(anchors[0]!.download).toBe(core.figure.setFilename(parameters));
  });

  it('a clip with a problem opens no panel', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('radio', { name: 'Cable clip' }));
    act(() => useClipStore.getState().apply({ ...useClipStore.getState().parameters, mount: 'nail', nailDiameter: 4, nailHeadDiameter: 2 }));
    expect(core.clip.clip(useClipStore.getState().parameters).problem).not.toBeNull();
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    expect(screen.queryByTestId('exportFilename')).toBeNull();
  });

  it('startExport(figure, set) is what a caller without the button uses', async () => {
    render(<App />);
    await act(async () => void startExport('figure', 'set'));
    expect(panel('Export Figure Set')).toBeTruthy();
  });
});

describe('writing the file', () => {
  it('File System Access: the picker opens inside the click, then the file is written and “saved”', async () => {
    const { handle, writable } = fakeHandle('Chosen.stl');
    const picker = installPicker(async () => handle);
    render(<App />);
    fireEvent.click(screen.getByTestId('exportBalloon'));
    const name = screen.getByTestId<HTMLInputElement>('exportFilename').value;
    fireEvent.click(screen.getByTestId('exportConfirm'));
    // No await between the click and the call: the user gesture is still alive.
    expect(picker).toHaveBeenCalledTimes(1);
    expect(picker.mock.calls[0]![0]).toEqual({
      suggestedName: name,
      types: [{ description: 'STL file', accept: { 'model/stl': ['.stl'] } }],
      excludeAcceptAllOption: true,
    });
    expect(screen.queryByTestId('exportFilename')).toBeNull();
    await settled();
    await waitFor(() => expect(useBalloonStore.getState().exported).toEqual({ filename: 'Chosen.stl', mode: 'saved' }));
    expect(writable.write).toHaveBeenCalledWith(BYTES);
    expect(writable.close).toHaveBeenCalled();
    expect(anchors).toHaveLength(0);
    expect(screen.getByText('File saved · Chosen.stl')).toBeTruthy();
  });

  it('shows “Preparing” while generating, not before the picker is answered', async () => {
    const { handle } = fakeHandle('Chosen.stl');
    let answerPicker = (_: unknown): void => undefined;
    installPicker(() => new Promise((answer) => (answerPicker = answer)));
    let finish = (_: ExportResult): void => undefined;
    exportMock.mockImplementation(() => new Promise((done) => (finish = done)));
    render(<App />);
    fireEvent.click(screen.getByTestId('exportBalloon'));
    fireEvent.click(screen.getByTestId('exportConfirm'));
    expect(useBalloonStore.getState().exporting).toBe(false);
    await act(async () => answerPicker(handle));
    expect(useBalloonStore.getState().exporting).toBe(true);
    expect(screen.getByTestId('exportBalloon').textContent).toContain('Preparing STL…');
    await act(async () => finish(result('x.stl')));
    await settled();
    expect(useBalloonStore.getState().exported?.mode).toBe('saved');
  });

  it('AbortError from the picker is a cancel: nothing changes', async () => {
    installPicker(async () => {
      throw new DOMException('The user aborted a request.', 'AbortError');
    });
    render(<App />);
    act(() => useBalloonStore.getState().setExported({ filename: 'Earlier.stl', mode: 'saved' }));
    const before = useBalloonStore.getState();
    fireEvent.click(screen.getByTestId('exportBalloon'));
    await act(async () => void fireEvent.click(screen.getByTestId('exportConfirm')));
    expect(exportMock).not.toHaveBeenCalled();
    const after = useBalloonStore.getState();
    expect([after.exporting, after.exported, after.error]).toEqual([before.exporting, before.exported, before.error]);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByTestId('exportFilename')).toBeNull();
  });

  it('another picker failure is an alert', async () => {
    installPicker(async () => {
      throw new DOMException('Must be handling a user gesture.', 'SecurityError');
    });
    render(<App />);
    fireEvent.click(screen.getByTestId('exportBalloon'));
    await act(async () => void fireEvent.click(screen.getByTestId('exportConfirm')));
    expect(screen.getByRole('alertdialog', { name: 'Export failed' }).textContent).toContain('Must be handling a user gesture.');
    expect(exportMock).not.toHaveBeenCalled();
  });

  it('a failed write aborts the swap file and reports', async () => {
    const { handle, writable } = fakeHandle('Chosen.stl', async () => {
      throw new DOMException('The disk is full.', 'QuotaExceededError');
    });
    installPicker(async () => handle);
    render(<App />);
    fireEvent.click(screen.getByTestId('exportBalloon'));
    await act(async () => void fireEvent.click(screen.getByTestId('exportConfirm')));
    await settled();
    expect(writable.abort).toHaveBeenCalled();
    expect(writable.close).not.toHaveBeenCalled();
    expect(useBalloonStore.getState().exported).toBeNull();
    expect(screen.getByRole('alertdialog', { name: 'Export failed' }).textContent).toContain('The disk is full.');
  });

  it('Blob fallback: generates, then downloads under the edited name and says “downloaded”', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('radio', { name: 'Basket' }));
    await user.click(screen.getByTestId('exportBasket'));
    const field = screen.getByTestId('exportFilename');
    await user.clear(field);
    await user.type(field, 'My basket{Enter}');
    await settled();
    await waitFor(() => expect(useBasketStore.getState().exported).toEqual({ filename: 'My basket.stl', mode: 'downloaded' }));
    expect(anchors).toEqual([{ download: 'My basket.stl', href: expect.stringContaining('blob:fake') }]);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('model/stl');
    expect(blob.size).toBe(BYTES.length);
    expect(screen.getByText('Basket downloaded · My basket.stl')).toBeTruthy();
  });

  it.each([
    ['balloon', 'Balloon', 'Export failed'],
    ['basket', 'Basket', 'Basket export failed'],
    ['ring', 'Ring', 'Ring export failed'],
    ['cloud', 'Cloud', 'Cloud export failed'],
    ['sun', 'Sun', 'Sun export failed'],
    ['figure', 'Figures', 'Figure export failed'],
    ['clip', 'Cable clip', 'Clip export failed'],
  ] as const)('a failed export shows the alert of %s', async (part, tab, alert) => {
    const user = userEvent.setup();
    exportMock.mockRejectedValue(new CoreFailure('invalid-mesh', 'The model could not be exported: no room.'));
    render(<App />);
    await user.click(screen.getByRole('radio', { name: tab }));
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    await user.click(screen.getByTestId('exportConfirm'));
    await settled();
    expect(screen.getByRole('alertdialog', { name: alert }).textContent).toContain('The model could not be exported: no room.');
    expect(stores[part].getState().exported).toBeNull();
    expect(stores[part].getState().exporting).toBe(false);
  });
});

describe('the footers agree with the table', () => {
  const cases: [PartKey, string, string, ExportVariant][] = [
    ['balloon', 'Balloon', 'exportBalloon', 'balloonSTL'],
    ['basket', 'Basket', 'exportBasket', 'basket'],
    ['ring', 'Ring', 'exportRing', 'ringSolid'],
    ['cloud', 'Cloud', 'exportCloud', 'cloud'],
    ['sun', 'Sun', 'exportSun', 'sun'],
    ['figure', 'Figures', 'exportFigure', 'figure'],
    ['clip', 'Cable clip', 'exportCableClip', 'clip'],
  ];

  it.each(cases)('%s', async (part, tab, testId, variant) => {
    const user = userEvent.setup();
    const { footerLabel, preparingLabel, savedPrefix } = EXPORT_TABLE[variant];
    render(<App />);
    await user.click(screen.getByRole('radio', { name: tab }));
    const button = screen.getByTestId(testId);
    expect(button.textContent).toContain(footerLabel);
    act(() => stores[part].getState().setExporting(true));
    expect(button.textContent).toContain(preparingLabel);
    act(() => stores[part].getState().setExporting(false));
    for (const mode of ['saved', 'downloaded'] as const) {
      const exported = { filename: 'file.bin', mode };
      act(() => stores[part].getState().setExported(exported));
      expect(screen.getByText(exportedLine(savedPrefix, exported))).toBeTruthy();
    }
  });
});

describe('opening files', () => {
  const fixture = (name: string): string => readFileSync(resolve(import.meta.dirname, '../../../references/fixtures/legacy-settings', name), 'utf8');
  const choose = (file: File) => fireEvent.change(screen.getByTestId('openFileInput'), { target: { files: [file] } });

  it('rejects other extensions with the Mac’s text', async () => {
    render(<App />);
    await act(async () => void choose(new File(['x'], 'model.obj')));
    expect(screen.getByRole('alertdialog', { name: 'Couldn’t open file' }).textContent).toContain('Choose a balloon STL or a cloud or sun settings JSON file.');
  });

  it('a sun settings file goes to the Sun tab', async () => {
    const text = fixture('sun-lamp-200-sun-settings.json');
    render(<App />);
    expect(useAppStore.getState().part).toBe('balloon');
    await act(async () => void choose(new File([text], 'sun-settings.json')));
    await waitFor(() => expect(useAppStore.getState().part).toBe('sun'));
    expect(useSunStore.getState().parameters).toEqual(core.lampSettings.decode(text));
    expect(screen.getByTestId('sunEditor')).toBeTruthy();
  });

  it('a cloud settings file goes to the Cloud tab', async () => {
    const text = fixture('cloud-lamp-230-cloud-settings.json');
    render(<App />);
    await act(async () => void choose(new File([text], 'cloud-settings.json')));
    await waitFor(() => expect(useAppStore.getState().part).toBe('cloud'));
    expect(useCloudStore.getState().parameters).toEqual(core.lampSettings.decode(text));
  });

  it('settings that do not decode are an alert, on the same tab', async () => {
    render(<App />);
    await act(async () => void choose(new File(['{"width":1}'], 'sun-settings.json')));
    await waitFor(() => expect(useImportStore.getState().error).not.toBeNull());
    expect(screen.getByRole('alertdialog', { name: 'Couldn’t open file' })).toBeTruthy();
    expect(useAppStore.getState().part).toBe('balloon');
  });

  it('an STL goes to review', async () => {
    const parameters = core.balloon.presets.classic;
    const mesh = { positions: new Float32Array(9), indices: new Uint32Array(3), maxOverhang: 0, dimensions: { x: 1, y: 1, z: 1 } };
    const imported = { parameters, notes: 'Recovered.', restoredSettings: true, mesh, editable: mesh } as unknown as ImportedBalloon;
    const importSTL = vi.spyOn(ioClient, 'importSTL').mockResolvedValue(imported);
    render(<App />);
    await act(async () => void choose(new File([new Uint8Array(84)], 'Balloon.STL')));
    await waitFor(() => expect(useImportStore.getState().review?.name).toBe('Balloon.STL'));
    expect(importSTL).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Open editable balloon' })).toBeTruthy();
  });

  it('an STL over the limit is refused before it is read', async () => {
    const importSTL = vi.spyOn(ioClient, 'importSTL');
    const big = new File(['x'], 'huge.stl');
    Object.defineProperty(big, 'size', { value: core.stl.maximumBytes + 1 });
    const read = vi.spyOn(big, 'arrayBuffer');
    render(<App />);
    await act(async () => void choose(big));
    expect(screen.getByRole('alertdialog', { name: 'Couldn’t open file' }).textContent).toContain(STL_ERRORS.tooLarge);
    expect(read).not.toHaveBeenCalled();
    expect(importSTL).not.toHaveBeenCalled();
  });

  it('a dropped file takes the same way, and is ignored while another is under review', async () => {
    render(<App />);
    const drop = (file: File) => fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file] } });
    await act(async () => void drop(new File(['x'], 'model.obj')));
    await waitFor(() => expect(useImportStore.getState().error).toBe('Choose a balloon STL or a cloud or sun settings JSON file.'));
    act(() => useImportStore.getState().setError(null));
    act(() => useImportStore.setState({ loading: true }));
    await act(async () => void drop(new File(['x'], 'model.obj')));
    expect(useImportStore.getState().error).toBeNull();
    act(() => useImportStore.setState({ loading: false }));
  });

  it('Mod+O opens the file input unless a file is loading', () => {
    render(<App />);
    const click = vi.spyOn(screen.getByTestId<HTMLInputElement>('openFileInput'), 'click');
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
    expect(click).toHaveBeenCalledTimes(1);
    act(() => useImportStore.setState({ loading: true }));
    fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
    expect(click).toHaveBeenCalledTimes(1);
    act(() => useImportStore.setState({ loading: false }));
  });
});
