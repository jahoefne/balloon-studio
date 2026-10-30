// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core/parameters';
import type { ImportedBalloon, MeshBuffers } from '../core/types';
import { lastStageProps, resetStudio, testKit, useAppStore, useBalloonStore, useImportStore } from '../test/studioMock';
import { App } from '../app/App';

vi.mock('../stores', () => import('../test/studioMock'));
vi.mock('../preview/Stage', () => import('../test/studioMock'));

const buffers = (x: number): MeshBuffers => ({
  positions: new Float32Array(9),
  indices: new Uint32Array([0, 1, 2]),
  maxOverhang: 0,
  dimensions: { x, y: 170.25, z: 220 },
});

const imported = (restoredSettings: boolean): ImportedBalloon => ({
  mesh: buffers(180),
  editable: buffers(178.96),
  parameters: core.balloon.normalize({ ...core.balloon.presets.round, hollow: true }),
  restoredSettings,
  notes: 'These settings came from the file.',
});

const review = (restoredSettings = true) => act(() => useImportStore.getState().setReview({ name: 'balloon.stl', imported: imported(restoredSettings) }));

describe('ImportReviewDialog', () => {
  beforeEach(resetStudio);

  it('shows the file, both previews and the settings origin', () => {
    render(<App />);
    review();
    const dialog = within(screen.getByRole('dialog', { name: 'Open editable balloon' }));
    expect(dialog.getByText('balloon.stl')).toBeTruthy();
    expect(dialog.getByText('These settings came from the file.')).toBeTruthy();
    expect(dialog.getByRole('heading', { name: 'Opened STL' })).toBeTruthy();
    expect(dialog.getByRole('heading', { name: 'Editable balloon' })).toBeTruthy();
    expect(dialog.getByText('180.0 × 170.2 × 220.0 mm')).toBeTruthy();
    expect(dialog.getByText('179.0 × 170.2 × 220.0 mm')).toBeTruthy();
    expect(dialog.getByText('Recovered settings')).toBeTruthy();
    expect(dialog.getByText(/^Continue to adjust the balloon’s shape/)).toBeTruthy();
    expect(lastStageProps()).toMatchObject({ showPlate: true, cutaway: false, inspectOpening: false, neckDiameter: 32 });
  });

  it('calls a reconstruction what it is', () => {
    render(<App />);
    review(false);
    const dialog = within(screen.getByRole('dialog', { name: 'Review reconstructed balloon' }));
    expect(dialog.getByText('Estimated settings · review before editing')).toBeTruthy();
  });

  it('Enter loads the balloon, resets the views and returns to the Balloon tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => {
      useAppStore.getState().selectPart('ring');
      useAppStore.getState().setBalloonView({ cutaway: true, inspectOpening: true, inspectTop: true });
    });
    review();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).toBeNull();
    const balloon = useBalloonStore.getState();
    expect(balloon.openedSTLName).toBe('balloon.stl');
    expect(balloon.importRevision).toBe(1);
    expect(balloon.parameters).toEqual(imported(true).parameters);
    expect(useImportStore.getState().review).toBeNull();
    expect(useAppStore.getState().part).toBe('balloon');
    expect(useAppStore.getState().balloonView).toMatchObject({ cutaway: false, inspectOpening: false, inspectTop: false, resetCamera: 1 });
    expect(screen.getByRole('heading', { name: 'Editable balloon' })).toBeTruthy();
  });

  it('Enter on the wireframe box is the default action too', async () => {
    const user = userEvent.setup();
    render(<App />);
    review();
    await user.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Wireframe' }));
    expect(lastStageProps().wireframe).toBe(true);
    await user.keyboard('{Enter}');
    expect(useBalloonStore.getState().openedSTLName).toBe('balloon.stl');
  });

  it('Esc and Cancel leave the balloon alone', async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = useBalloonStore.getState().parameters;
    review();
    await user.keyboard('{Escape}');
    expect(useImportStore.getState().review).toBeNull();
    review();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useImportStore.getState().review).toBeNull();
    expect(useBalloonStore.getState().parameters).toBe(before);
    expect(useBalloonStore.getState().openedSTLName).toBeNull();
  });

  it('“Reset views” frames both previews again', async () => {
    const user = userEvent.setup();
    render(<App />);
    review();
    const before = lastStageProps().resetCamera;
    await user.click(screen.getByRole('button', { name: 'Reset views' }));
    expect(lastStageProps().resetCamera).toBe(before + 1);
  });

  it('a chosen STL ends up here', async () => {
    testKit.deps.ioClient.importSTL = () => Promise.resolve(imported(true));
    render(<App />);
    await act(() => useAppStore.getState().openFile(new File(['solid'], 'chosen.stl')));
    expect(within(screen.getByRole('dialog', { name: 'Open editable balloon' })).getByText('chosen.stl')).toBeTruthy();
    expect(screen.getByTestId<HTMLButtonElement>('openFile').disabled).toBe(true);
  });
});
