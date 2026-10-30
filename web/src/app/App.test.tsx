// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core/parameters';
import { resetStudio, useAppStore, useBalloonStore, useImportStore } from '../test/studioMock';
import { App } from './App';

vi.mock('../stores', () => import('../test/studioMock'));
vi.mock('../preview/Stage', () => import('../test/studioMock'));

const OPEN_MESSAGE = 'Choose a balloon STL, cloud-settings.json, or sun-settings.json from an exported lamp kit.';

describe('App shell', () => {
  beforeEach(resetStudio);

  it('shows the header in the Mac order', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Balloon Studio' })).toBeTruthy();
    expect(screen.getByText('A little shape. A lot of possibility.')).toBeTruthy();
    const parts = within(screen.getByRole('radiogroup', { name: 'Part' })).getAllByRole('radio');
    expect(parts.map((part) => part.textContent)).toEqual(['Balloon', 'Basket', 'Ring', 'Cloud', 'Sun', 'Figures', 'Cable clip']);
    expect(parts[0]!.getAttribute('aria-checked')).toBe('true');
    const open = screen.getByTestId('openFile');
    expect(open.textContent).toBe('Open…');
    expect(open.title).toBe(OPEN_MESSAGE);
    expect(screen.getByRole('button', { name: 'Reset part' })).toBeTruthy();
    expect(screen.getByText('Made for your P2S')).toBeTruthy();
  });

  it('builds the first preview on mount', () => {
    render(<App />);
    expect(useBalloonStore.getState().updating).toBe(true);
  });

  it('opens the About panel from the mark', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'About Balloon Studio' }));
    const dialog = screen.getByRole('dialog', { name: 'Balloon Studio' });
    expect(dialog.textContent).toContain('Parametric balloons, baskets, mobile rings, hanging figures, cloud and sun lamps and cable clips for 3D printing.');
    expect(dialog.textContent).toContain('Built for the Bambu Lab P2S.');
    expect(dialog.textContent).toContain('All dimensions are in millimetres.');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog', { name: 'Balloon Studio' })).toBeNull();
  });

  it('commits the field being edited when the tab changes', async () => {
    const user = userEvent.setup();
    render(<App />);
    const field = screen.getByRole('textbox', { name: 'Envelope height' });
    await user.clear(field);
    await user.type(field, '200');
    expect(useBalloonStore.getState().parameters.height).not.toBe(200);
    await user.click(screen.getByRole('radio', { name: 'Basket' }));
    expect(useBalloonStore.getState().parameters.height).toBe(200);
    expect(useAppStore.getState().part).toBe('basket');
  });

  it('renders each part’s editor behind its tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('exportBalloon')).toBeTruthy();
    for (const [title, exportId] of [
      ['Basket', 'exportBasket'],
      ['Ring', 'exportRing'],
      ['Cloud', 'exportCloud'],
      ['Sun', 'exportSun'],
      ['Figures', 'exportFigure'],
      ['Cable clip', 'exportCableClip'],
    ] as const) {
      await user.click(screen.getByRole('radio', { name: title }));
      expect(screen.getByTestId(exportId)).toBeTruthy();
      expect(screen.queryByTestId('exportBalloon')).toBeNull();
    }
  });

  it('keeps the Balloon view toggles across a tab switch', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Wireframe' }));
    await user.click(screen.getByRole('radio', { name: 'Ring' }));
    await user.click(screen.getByRole('radio', { name: 'Balloon' }));
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Wireframe' }).checked).toBe(true);
  });

  it('Mod+E runs the export of the part on screen, once at a time', async () => {
    render(<App />);
    const button = screen.getByTestId('exportBalloon');
    const begin = vi.spyOn(useBalloonStore.getState(), 'beginExport');
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    expect(button.textContent).toContain('Preparing STL…');
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true });
    await waitFor(() => expect(button.textContent).toContain('Export STL…'));
    expect(begin).toHaveBeenCalledTimes(2);
    begin.mockRestore();
  });

  describe('Reset part', () => {
    const tall = () => useBalloonStore.getState().applyShape(core.balloon.presets.tall);

    it('Alt+N resets the balloon to Classic', () => {
      render(<App />);
      act(tall);
      expect(useBalloonStore.getState().parameters.height).toBe(core.balloon.presets.tall.height);
      fireEvent.keyDown(window, { key: '˜', code: 'KeyN', altKey: true });
      expect(useBalloonStore.getState().parameters).toEqual(core.balloon.presets.classic);
    });

    it('Alt+N inside a text field stays a typed character', () => {
      render(<App />);
      act(tall);
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Envelope height' }), { key: '˜', code: 'KeyN', altKey: true });
      expect(useBalloonStore.getState().parameters.height).toBe(core.balloon.presets.tall.height);
    });

    it('the button does the same and commits first', async () => {
      const user = userEvent.setup();
      render(<App />);
      act(tall);
      const field = screen.getByRole('textbox', { name: 'Widest diameter' });
      await user.clear(field);
      await user.type(field, '99');
      await user.click(screen.getByRole('button', { name: 'Reset part' }));
      expect(useBalloonStore.getState().parameters).toEqual(core.balloon.presets.classic);
    });
  });

  describe('Open', () => {
    it('Mod+O and the button open the file input, unless a file is loading', async () => {
      const user = userEvent.setup();
      render(<App />);
      const input = screen.getByTestId<HTMLInputElement>('openFileInput');
      expect(input.accept).toBe('.stl,.json');
      const click = vi.spyOn(input, 'click');
      fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
      expect(click).toHaveBeenCalledTimes(1);
      await user.click(screen.getByTestId('openFile'));
      expect(click).toHaveBeenCalledTimes(2);
      act(() => useImportStore.setState({ loading: true }));
      fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
      expect(click).toHaveBeenCalledTimes(2);
      const open = screen.getByTestId<HTMLButtonElement>('openFile');
      expect(open.textContent).toBe('Opening…');
      expect(open.disabled).toBe(true);
    });

    it('rejects other file types with the “Couldn’t open file” alert', async () => {
      const user = userEvent.setup();
      render(<App />);
      fireEvent.change(screen.getByTestId('openFileInput'), { target: { files: [new File(['x'], 'part.obj')] } });
      const alert = await screen.findByRole('alertdialog', { name: 'Couldn’t open file' });
      expect(alert.textContent).toContain('Choose a balloon STL or a cloud or sun settings JSON file.');
      await user.keyboard('{Enter}');
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(useImportStore.getState().error).toBeNull();
    });

    it('shows the panel message while a file is dragged over the window, and opens it on drop', async () => {
      render(<App />);
      const open = vi.spyOn(useAppStore.getState(), 'openFile');
      expect(screen.queryByTestId('dropZone')).toBeNull();
      const dataTransfer = { types: ['Files'], files: [new File(['x'], 'part.obj')] };
      fireEvent.dragEnter(window, { dataTransfer });
      expect(screen.getByTestId('dropZone').textContent).toContain(OPEN_MESSAGE);
      fireEvent.dragEnter(window, { dataTransfer });
      fireEvent.dragLeave(window, { dataTransfer });
      expect(screen.getByTestId('dropZone')).toBeTruthy();
      fireEvent.dragLeave(window, { dataTransfer });
      expect(screen.queryByTestId('dropZone')).toBeNull();
      fireEvent.dragEnter(window, { dataTransfer });
      fireEvent.drop(window, { dataTransfer });
      expect(screen.queryByTestId('dropZone')).toBeNull();
      expect(await screen.findByRole('alertdialog', { name: 'Couldn’t open file' })).toBeTruthy();
      open.mockRestore();
    });

    it('ignores drags that carry no file', () => {
      render(<App />);
      fireEvent.dragEnter(window, { dataTransfer: { types: ['text/plain'], files: [] } });
      expect(screen.queryByTestId('dropZone')).toBeNull();
    });
  });

  it('shows “Export failed” for the balloon’s error', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => useBalloonStore.getState().setError('The model could not be exported: no room.'));
    expect(screen.getByRole('alertdialog', { name: 'Export failed' }).textContent).toContain('The model could not be exported: no room.');
    await user.keyboard('{Escape}');
    expect(useBalloonStore.getState().error).toBeNull();
  });

  it('shows the storage hint until dismissed', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => useAppStore.getState().setStorageWarning('Storage is full.'));
    expect(screen.getByRole('status').textContent).toContain('Storage is full.');
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
