// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core/parameters';
import type { StageProps } from '../../preview';
import BasketEditor from '.';
import { answerPreviews, kit, resetStudio, useBalloonStore, useBasketStore } from './testStudio';

const stage = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('../../stores', () => import('./testStudio'));
vi.mock('../../preview', async (original) => ({
  ...(await original<typeof import('../../preview')>()),
  Stage: (props: unknown) => {
    stage.props = props;
    return null;
  },
}));
const stageProps = () => stage.props as StageProps;

const field = (name: string) => screen.queryByRole('textbox', { name }) as HTMLInputElement | null;
const metrics = () => screen.getAllByRole('term').map((title) => [title.textContent, title.nextElementSibling?.textContent]);

beforeEach(async () => {
  cleanup();
  await resetStudio();
});

describe('BasketEditor', () => {
  it('lists the styles in Swift order with title and subtitle, and marks the chosen one', () => {
    render(<BasketEditor />);
    const cards = screen.getAllByRole('button', { name: /basket$/ });
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['Wicker basket', 'Ribbed basket', 'Voyager basket']);
    expect(within(cards[1]!).getByText('Round basket · vertical fluting')).toBeTruthy();
    expect(cards.map((card) => card.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    fireEvent.click(cards[2]!);
    expect(useBasketStore.getState().parameters.style).toBe('voyager');
    expect(screen.getByRole('heading', { name: 'Voyager basket' })).toBeTruthy();
  });

  it('ribbed hides Depth and renames Width to Diameter', () => {
    render(<BasketEditor />);
    expect(field('Width')).toBeTruthy();
    expect(field('Depth')).toBeTruthy();
    expect(field('Diameter')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ribbed basket' }));
    expect(field('Diameter')).toBeTruthy();
    expect(field('Width')).toBeNull();
    expect(field('Depth')).toBeNull();
    // FOOTPRINT uses actualDepth, which is the width on a ribbed basket.
    expect(metrics()[0]).toEqual(['FOOTPRINT', '64 × 64mm']);
  });

  it('has the Swift ranges and steps', () => {
    render(<BasketEditor />);
    const slider = (name: string) => screen.getByRole('slider', { name: `${name} slider` }) as HTMLInputElement;
    const bounds = (name: string) => [slider(name).min, slider(name).max, slider(name).step];
    expect(bounds('Width')).toEqual(['40', '100', '1']);
    expect(bounds('Depth')).toEqual(['30', '90', '1']);
    expect(bounds('Basket height')).toEqual(['24', '70', '1']);
    expect(bounds('Basket wall')).toEqual(['1.6', '3.2', '0.2']);
    expect(bounds('Surface detail')).toEqual(['0', '1', '0.1']);
    expect(bounds('Cord clearance')).toEqual(['2', '5', '0.5']);
  });

  it('Match balloon sizes the basket from the balloon', () => {
    render(<BasketEditor />);
    const balloon = useBalloonStore.getState().parameters;
    const button = screen.getByRole('button', { name: 'Match balloon' });
    expect(button.getAttribute('title')).toBe('Size this basket in proportion to the current balloon.');
    fireEvent.click(button);
    const { width, depth, height } = useBasketStore.getState().parameters;
    expect([width, depth, height]).toEqual([Math.round(balloon.diameter * 0.35), Math.round(balloon.diameter * 0.27), Math.round(balloon.height * 0.19)]);
  });

  it('the hole button says "match" only while the balloon has holes of the same clearance', () => {
    render(<BasketEditor />);
    const label = () => screen.getByRole('button', { name: /balloon holes/i }).textContent;
    expect(label()).toBe('Add matching balloon holes');

    fireEvent.click(screen.getByRole('button', { name: /balloon holes/i }));
    expect(useBalloonStore.getState().parameters.stringHoles).toBe(true);
    expect(useBalloonStore.getState().parameters.cordClearance).toBe(3);
    expect(label()).toBe('Balloon holes match');

    fireEvent.change(screen.getByRole('slider', { name: 'Cord clearance slider' }), { target: { value: '4' } });
    expect(label()).toBe('Add matching balloon holes');
  });

  it('the hole button commits the field being edited first and uses its value', () => {
    render(<BasketEditor />);
    const input = field('Cord clearance')!;
    input.focus();
    fireEvent.change(input, { target: { value: '4.5' } });
    kit.commitEditing.mockImplementationOnce(() => input.blur());
    fireEvent.click(screen.getByRole('button', { name: /balloon holes/i }));
    expect(useBasketStore.getState().parameters.cordClearance).toBe(4.5);
    expect(useBalloonStore.getState().parameters.cordClearance).toBe(4.5);
  });

  it('shows the footer states: caption, preparing, saved', () => {
    render(<BasketEditor />);
    const button = screen.getByTestId('exportBasket') as HTMLButtonElement;
    expect(button.textContent).toContain('Export Basket STL…');
    const caption = 'Separate STL · four string holes · millimetres';
    expect(screen.getByText(caption)).toBeTruthy();

    kit.commitEditing.mockClear();
    fireEvent.click(button);
    expect(kit.commitEditing).toHaveBeenCalled();

    act(() => useBasketStore.getState().setExporting(true));
    expect(button.textContent).toContain('Preparing basket…');
    expect(button.disabled).toBe(true);

    act(() => {
      useBasketStore.getState().setExporting(false);
      useBasketStore.getState().setExported({ filename: 'Basket.stl', mode: 'saved' });
    });
    expect(screen.getByText('Basket saved · Basket.stl')).toBeTruthy();
    expect(screen.queryByText(caption)).toBeNull();

    act(() => useBasketStore.getState().setExported({ filename: 'Basket.stl', mode: 'downloaded' }));
    expect(screen.getByText('Basket downloaded · Basket.stl')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ribbed basket' }));
    expect(screen.getByText(caption)).toBeTruthy();
  });

  it('passes the Swift preview props to the stage', async () => {
    render(<BasketEditor />);
    await answerPreviews();
    const p = useBasketStore.getState().parameters;
    expect(stageProps()).toMatchObject({
      compactObject: true,
      sharpEdges: true,
      smoothAngle: Math.PI / 6,
      smoothBelowHeight: core.basket.derived(p).holeCenter - p.cordClearance / 2 - 0.6,
      showPlate: true,
      wireframe: false,
      cutaway: false,
      neckDiameter: 0,
      inspectOpening: false,
    });
    expect(stageProps().mesh).toBe(useBasketStore.getState().bundle?.mesh);
    expect(stageProps().faceColors).toBeUndefined();
    expect(stageProps().geometryKey).toBe(String(useBasketStore.getState().revision));
  });

  it('toggles, swatches and camera reset reach the stage', () => {
    render(<BasketEditor />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cutaway' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Build plate' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wireframe' }));
    expect(stageProps()).toMatchObject({ cutaway: true, showPlate: false, wireframe: true });

    const first = stageProps().color;
    const swatch = screen.getByRole('button', { name: 'Preview colour 2' });
    expect(swatch.getAttribute('title')).toBe('Preview colour only');
    fireEvent.click(swatch);
    expect(stageProps().color).not.toEqual(first);
    expect(swatch.getAttribute('aria-pressed')).toBe('true');

    const before = stageProps().resetCamera;
    fireEvent.click(screen.getByRole('button', { name: 'Reset basket camera' }));
    expect(stageProps().resetCamera).toBe(before + 1);
  });

  it('shows the badge, metrics and advice from BasketEditor.swift:198-239', () => {
    render(<BasketEditor />);
    expect(screen.getByText('4 cord holes · open top')).toBeTruthy();
    expect(screen.getByText('Drag to orbit · Scroll to zoom').textContent).toBe('Drag to orbit  ·  Scroll to zoom');
    expect(metrics()).toEqual([
      ['FOOTPRINT', '64 × 48mm'],
      ['HEIGHT', '42mm'],
      ['CORD CLEARANCE', '3mm'],
    ]);
    fireEvent.change(screen.getByRole('slider', { name: 'Cord clearance slider' }), { target: { value: '3.5' } });
    expect(metrics()[2]).toEqual(['CORD CLEARANCE', '3.5mm']);
    expect(screen.getByText('Print separately, then string together')).toBeTruthy();
    expect(screen.getByText(/^Print flat base down\./)).toBeTruthy();
  });

  it('shows store errors in the export alert', () => {
    render(<BasketEditor />);
    expect(screen.queryByText('Basket export failed')).toBeNull();
    act(() => useBasketStore.getState().setError('The model could not be exported: boom'));
    expect(screen.getByText('Basket export failed')).toBeTruthy();
    expect(screen.getByText('The model could not be exported: boom')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(useBasketStore.getState().error).toBeNull();
  });
});
