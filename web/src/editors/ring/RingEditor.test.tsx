// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { core } from '#core/parameters';
import type { RingParameters } from '../../core/types';
import type { StageProps } from '../../preview';
import { answerPreviews, kit, resetStudio, useBalloonStore, useRingStore } from '../basket/testStudio';
import { ContinuousCordDiagram, SeparateCordDiagram } from './CordDiagrams';
import RingEditor from '.';
import { LEDReflectorDiagram } from './LEDReflectorDiagram';

const stage = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('../../stores', () => import('../basket/testStudio'));
vi.mock('../../preview', async (original) => ({
  ...(await original<typeof import('../../preview')>()),
  Stage: (props: unknown) => {
    stage.props = props;
    return null;
  },
}));
const stageProps = () => stage.props as StageProps;

const field = (name: string) => screen.queryByRole('textbox', { name }) as HTMLInputElement | null;
const slider = (name: string) => screen.getByRole('slider', { name: `${name} slider` }) as HTMLInputElement;
const bounds = (name: string) => [slider(name).min, slider(name).max, slider(name).step];
const metrics = () =>
  within(screen.getByTestId('ringMetrics'))
    .getAllByRole('term')
    .map((title) => [title.textContent, title.nextElementSibling?.textContent]);
const part = () => screen.getByTestId('ringPreviewPart') as HTMLSelectElement;
const lightMount = () => screen.getByTestId('ringLightMount') as HTMLSelectElement;

const choose = (select: HTMLSelectElement, label: string) => {
  const option = within(select).getByRole('option', { name: label }) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
};
const construction = (label: 'One piece' | 'Six sections') =>
  fireEvent.click(within(screen.getByTestId('ringConstruction')).getByRole('radio', { name: label }));
const setParameters = (change: Partial<RingParameters>) =>
  act(() => useRingStore.getState().apply({ ...useRingStore.getState().parameters, ...change }));

/** Everything drawn into an SVG: a NaN anywhere shows up as text in an attribute. */
const expectFiniteDrawing = (svg: Element) => {
  const shapes = svg.querySelectorAll('path, rect, line, circle, ellipse, polyline');
  expect(shapes.length).toBeGreaterThan(0);
  for (const shape of shapes) {
    for (const { name, value } of shape.attributes) {
      expect(value, `${shape.tagName} ${name}`).not.toMatch(/NaN|Infinity|undefined/);
    }
  }
};

beforeEach(async () => {
  cleanup();
  await resetStudio();
});

describe('RingEditor sidebar', () => {
  it('starts as the solid uplight ring with the Swift labels', () => {
    render(<RingEditor />);
    expect(screen.getByText('A MOBILE FOR THREE')).toBeTruthy();
    expect(screen.getByText('One ring. Three balloons.')).toBeTruthy();
    expect(screen.getByText(/^One continuous ring with three ceiling holes/)).toBeTruthy();
    expect(field('Base thickness')).toBeTruthy();
    expect(field('Ring thickness')).toBeNull();
    expect(lightMount().selectedOptions[0]?.textContent).toBe('Reflected uplight');
    expect(screen.getByRole('heading', { name: 'Your solid ring' })).toBeTruthy();
  });

  it('has the Swift ranges and steps, which follow the parameters', () => {
    render(<RingEditor />);
    expect(bounds('Ring diameter')).toEqual(['140', '600', '1']);
    expect(bounds('Base thickness')).toEqual(['8', '16', '0.5']);
    expect(bounds('Ring cord clearance')).toEqual(['4', '8', '0.5']);
    expect(bounds('LED strip width')).toEqual(['3.5', '12', '0.5']);
    expect(bounds('LED fit allowance')).toEqual(['0.2', '1', '0.1']);
    expect(bounds('Strip thickness incl. LEDs')).toEqual(['1', '6', '0.5']);
    const d = core.ring.derived(useRingStore.getState().parameters);
    expect(bounds('Band width')).toEqual([String(d.minimumBandWidth), String(d.maximumBandWidth), '1']);

    fireEvent.change(lightMount(), { target: { value: '1' } });
    expect(bounds('Ring thickness')).toEqual(['4', '10', '0.5']);
    expect(bounds('Ring cord clearance')).toEqual(['2', '5', '0.5']);
    expect(bounds('Channel depth')).toEqual(['0.6', String(core.ring.derived(useRingStore.getState().parameters).maximumChannelDepth), '0.1']);

    construction('Six sections');
    expect(bounds('Ring diameter')).toEqual(['300', '600', '1']);
    expect(bounds('Joint fit allowance')).toEqual(['0.2', '0.6', '0.1']);
  });

  it('segmented switches copy, sections and guide button', () => {
    render(<RingEditor />);
    expect(screen.getByTestId('ringAssemblyGuide').textContent).toBe('Printing & lighting guide');
    expect(screen.queryByText('PERMANENT JOINTS')).toBeNull();
    expect(screen.getByTestId('exportRing').textContent).toContain('Export Ring STL…');
    expect(screen.getByText('STL · millimetres · checked before export')).toBeTruthy();

    construction('Six sections');
    expect(useRingStore.getState().parameters.segmented).toBe(true);
    expect(screen.getByText('A bigger ring, printed in parts.')).toBeTruthy();
    expect(screen.getByText(/^Three cord-guide sections alternate/)).toBeTruthy();
    expect(screen.getByText('PERMANENT JOINTS')).toBeTruthy();
    expect(screen.getByText('CONTINUOUS CORD GUIDES')).toBeTruthy();
    expect(screen.getByText(/The assembled ring is larger than the bed/)).toBeTruthy();
    expect(screen.getByText(/plus 4 mm at the joint plates\.$/)).toBeTruthy();
    expect(screen.getByText(/check one printed section for opacity/)).toBeTruthy();
    expect(screen.getByText(/The small holes are for alignment pins\.$/)).toBeTruthy();
    expect(screen.getByTestId('ringAssemblyGuide').textContent).toBe('Printing & assembly guide');
    expect(screen.getByTestId('exportRing').textContent).toContain('Export Ring Kit…');
    expect(screen.getByText('ZIP · 4 STL designs + assembly notes')).toBeTruthy();
    expect(screen.queryByText(/exceeds the P2S bed/)).toBeNull();
    // The preview follows the mesh, not the slider.
    expect(screen.getByRole('heading', { name: 'Your solid ring' })).toBeTruthy();
  });

  it('lighting(true) forces strip, fit allowance and at least a 40 mm band', () => {
    render(<RingEditor />);
    fireEvent.change(lightMount(), { target: { value: '1' } });
    expect(useRingStore.getState().parameters.reflectedLED).toBe(false);
    setParameters({ stripWidth: 5, ledClearance: 0.3, bandWidth: 24 });
    expect(useRingStore.getState().parameters).toMatchObject({ stripWidth: 5, ledClearance: 0.3 });
    expect(useRingStore.getState().parameters.bandWidth).toBeLessThan(40);

    fireEvent.change(lightMount(), { target: { value: '0' } });
    const { reflectedLED, stripWidth, ledClearance, bandWidth } = useRingStore.getState().parameters;
    expect({ reflectedLED, stripWidth, ledClearance }).toEqual({ reflectedLED: true, stripWidth: 8, ledClearance: 0.5 });
    expect(bandWidth).toBeGreaterThanOrEqual(40);
    expect(field('Band width')?.value).toBe(String(bandWidth));

    // A wider band stays.
    setParameters({ bandWidth: 50 });
    act(() => useRingStore.getState().lighting(true));
    expect(useRingStore.getState().parameters.bandWidth).toBe(50);
  });

  it('switches between the LED panel variants', () => {
    render(<RingEditor />);
    expect(screen.getByTestId('ledReflectorDiagram')).toBeTruthy();
    expect(field('Strip thickness incl. LEDs')).toBeTruthy();
    expect(field('Channel depth')).toBeNull();

    fireEvent.change(lightMount(), { target: { value: '1' } });
    expect(screen.queryByTestId('ledReflectorDiagram')).toBeNull();
    expect(field('Channel depth')).toBeTruthy();
    const p = useRingStore.getState().parameters;
    const d = core.ring.derived(p);
    expect(screen.getByText(`Top channel: ${d.channelWidth} mm wide · ${d.floorThickness} mm underneath.`)).toBeTruthy();
    expect(screen.getByText('STRING ATTACHMENTS')).toBeTruthy();
    expect(screen.getByText(/^Six through-holes beside the LED channel/)).toBeTruthy();
  });

  it('offers the 240 mm test print only for a solid ring beyond the bed', () => {
    render(<RingEditor />);
    expect(screen.getByText(/Full-size model · exceeds the P2S bed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use 240 mm for a test print' }));
    expect(useRingStore.getState().parameters.diameter).toBe(240);
    expect(screen.queryByRole('button', { name: 'Use 240 mm for a test print' })).toBeNull();
  });

  it('the hanger button sets the balloon hanger to the committed ring clearance', () => {
    render(<RingEditor />);
    fireEvent.change(lightMount(), { target: { value: '1' } });
    setParameters({ cordClearance: 3 });
    const input = field('Ring cord clearance')!;
    input.focus();
    fireEvent.change(input, { target: { value: '4' } });
    kit.commitEditing.mockImplementationOnce(() => input.blur());
    fireEvent.click(screen.getByRole('button', { name: 'Add matching balloon hanger' }));
    expect(useBalloonStore.getState().parameters).toMatchObject({ hangingLoop: true, hangingClearance: 4 });
  });
});

describe('RingEditor preview', () => {
  const segmented = async () => {
    render(<RingEditor />);
    construction('Six sections');
    await answerPreviews();
  };

  it('solid ring: title, badge, print hint, metrics, advice and diagram', async () => {
    render(<RingEditor />);
    await answerPreviews();
    expect(screen.getByText('450 mm solid ring · exceeds P2S bed')).toBeTruthy();
    expect(screen.getByText('Print flat · channel up')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Build plate' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Exploded assembly' })).toBeNull();
    const p = useRingStore.getState().parameters;
    const d = core.ring.derived(p);
    expect(metrics()).toEqual([
      ['RING DIAMETER', '450mm'],
      ['LED STRIP', '8mm wide'],
      ['STRIP PATH ≈', `${Math.round(d.stripPathLength)}mm`],
    ]);
    expect(screen.getByText('3 ceiling holes + 3 balloon holes')).toBeTruthy();
    expect(screen.getByText('6 bevelled attachment holes · 8 mm LED strip · ring carries balloon weight')).toBeTruthy();
    expect(screen.getByTestId('separateCordDiagram')).toBeTruthy();

    act(() => useRingStore.getState().setField('diameter', 240));
    await answerPreviews();
    expect(screen.getByText('Fits P2S · flat underside on the bed')).toBeTruthy();

    fireEvent.change(lightMount(), { target: { value: '1' } });
    await answerPreviews();
    const flat = useRingStore.getState().parameters;
    const flatDerived = core.ring.derived(flat);
    expect(metrics()[1]).toEqual(['LED CHANNEL', `${flatDerived.channelWidth}mm wide`]);
    expect(screen.getByText(`Balloon ties are ${Math.trunc(flatDerived.balloonSpacing)} mm apart; stagger larger balloons in height.`)).toBeTruthy();
  });

  it('part select: 3/6/12 copies, footprint from the part mesh, the right hints', async () => {
    await segmented();
    expect(Array.from(part().options).map((option) => option.textContent)).toEqual([
      'Assembled ring',
      'A · Cord guide · print 3',
      'B · Plain section · print 3',
      'C · Joint plate · print 6',
      'D · Alignment pin · print 12',
    ]);
    expect(screen.getByText('450 mm assembly · printed as separate parts')).toBeTruthy();
    expect(metrics()[0]?.[0]).toBe('RING DIAMETER');
    expect(screen.getByText('Main cords continue through the ring')).toBeTruthy();
    expect(screen.getByTestId('continuousCordDiagram')).toBeTruthy();
    expect(screen.getByText(/^Print 3 A \+ 3 B \+ 6 plates \+ 12 pins/)).toBeTruthy();

    const expected: [string, number, string, string][] = [
      ['A · Cord guide · print 3', 0, 'Print flat · channel up', 'Fits P2S · flat underside on the bed'],
      ['B · Plain section · print 3', 1, 'Print flat · channel up', 'Fits P2S · flat underside on the bed'],
      ['C · Joint plate · print 6', 2, 'Print flat · underside joint plate', 'Fits P2S · flat underside on the bed'],
      ['D · Alignment pin · print 12', 3, 'Print upright · bevelled ends', 'Fits P2S · upright on the small flat end'],
    ];
    for (const [label, index, hint, badge] of expected) {
      choose(part(), label);
      const mesh = useRingStore.getState().bundle!.parts[index]!;
      expect(stageProps().mesh).toBe(mesh);
      expect(stageProps().faceColors).toBe(mesh.faceColors);
      expect(screen.getByText(hint)).toBeTruthy();
      expect(screen.getByText(badge)).toBeTruthy();
      const { x, y, z } = mesh.dimensions;
      const copies = index === 3 ? '12' : index === 2 ? '6' : '3';
      const height = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, useGrouping: false, roundingMode: 'halfEven' }).format(z);
      expect(metrics()).toEqual([
        ['PART FOOTPRINT', `${Math.ceil(x)} × ${Math.ceil(y)}mm`],
        ['PART HEIGHT', `${height}mm`],
        ['PRINT QUANTITY', `${copies}copies`],
      ]);
      expect(screen.getByRole('checkbox', { name: 'Build plate' })).toBeTruthy();
      expect(screen.queryByRole('checkbox', { name: 'Exploded assembly' })).toBeNull();
    }
  });

  it('exploded assembly swaps the mesh and hides the plate on the assembly', async () => {
    await segmented();
    const { assembled, exploded } = useRingStore.getState().bundle!;
    expect(stageProps().mesh).toBe(assembled);
    expect(stageProps().showPlate).toBe(false);
    expect(screen.queryByRole('checkbox', { name: 'Build plate' })).toBeNull();
    const key = stageProps().geometryKey;
    fireEvent.click(screen.getByRole('checkbox', { name: 'Exploded assembly' }));
    expect(stageProps().mesh).toBe(exploded);
    expect(stageProps().faceColors).toBe(exploded.faceColors);
    expect(stageProps().geometryKey).not.toBe(key);
    choose(part(), 'C · Joint plate · print 6');
    expect(stageProps().showPlate).toBe(true);
  });

  it('Top view toggles, resets with the camera button and when the part changes', async () => {
    await segmented();
    const top = () => screen.getByRole('button', { name: /^(Top|Angled) view$/ });
    expect(top().textContent).toBe('Top view');
    fireEvent.click(top());
    expect(top().textContent).toBe('Angled view');
    expect(stageProps().topDown).toBe(true);

    let camera = stageProps().resetCamera;
    fireEvent.click(screen.getByRole('button', { name: 'Reset ring camera' }));
    expect(stageProps().topDown).toBe(false);
    expect(stageProps().resetCamera).toBe(camera + 1);

    fireEvent.click(top());
    camera = stageProps().resetCamera;
    choose(part(), 'A · Cord guide · print 3');
    expect(stageProps().topDown).toBe(false);
    expect(stageProps().resetCamera).toBeGreaterThan(camera);
  });

  it('frames again on exploded and on a new diameter, only once the mesh has it', async () => {
    await segmented();
    let camera = stageProps().resetCamera;
    fireEvent.click(screen.getByRole('checkbox', { name: 'Exploded assembly' }));
    expect(stageProps().resetCamera).toBeGreaterThan(camera);

    camera = stageProps().resetCamera;
    act(() => useRingStore.getState().setField('diameter', 500));
    expect(stageProps().resetCamera).toBe(camera);
    await answerPreviews();
    expect(stageProps().resetCamera).toBe(camera + 1);
    expect(screen.getByText('500 mm assembly · printed as separate parts')).toBeTruthy();
  });

  it('changing the construction goes back to the assembly and un-explodes', async () => {
    await segmented();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Exploded assembly' }));
    choose(part(), 'D · Alignment pin · print 12');
    const camera = stageProps().resetCamera;

    construction('One piece');
    await answerPreviews();
    expect(stageProps().resetCamera).toBeGreaterThan(camera);
    expect(screen.getByRole('heading', { name: 'Your solid ring' })).toBeTruthy();

    construction('Six sections');
    await answerPreviews();
    expect(part().selectedOptions[0]?.textContent).toBe('Assembled ring');
    expect((screen.getByRole('checkbox', { name: 'Exploded assembly' }) as HTMLInputElement).checked).toBe(false);
    expect(stageProps().mesh).toBe(useRingStore.getState().bundle?.assembled);
  });

  it('shows the placeholder state before the first preview arrives', () => {
    render(<RingEditor />);
    expect(screen.getByTestId('exportRing')).toBeTruthy();
    expect(metrics()).toHaveLength(3);
  });

  it('passes the Swift preview props to the stage', async () => {
    render(<RingEditor />);
    await answerPreviews();
    const mesh = useRingStore.getState().bundle!.assembled;
    expect(stageProps()).toMatchObject({
      mesh,
      color: [0.9, 0.9, 0.9],
      showPlate: true,
      wireframe: false,
      cutaway: false,
      inspectOpening: false,
      neckDiameter: 0,
      compactObject: true,
      topDown: false,
      objectName: 'mobile ring',
      sharpEdges: true,
    });
    expect(stageProps().faceColors).toBe(mesh.faceColors);
    expect(stageProps().detailColor).toBeDefined();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wireframe' }));
    expect(stageProps().wireframe).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Build plate' }));
    expect(stageProps().showPlate).toBe(false);
  });

  it('shows the footer states and errors', () => {
    render(<RingEditor />);
    const button = screen.getByTestId('exportRing') as HTMLButtonElement;
    kit.commitEditing.mockClear();
    fireEvent.click(button);
    expect(kit.commitEditing).toHaveBeenCalled();

    act(() => useRingStore.getState().setExporting(true));
    expect(button.textContent).toContain('Preparing ring…');
    expect(button.disabled).toBe(true);

    act(() => {
      useRingStore.getState().setExporting(false);
      useRingStore.getState().setExported({ filename: 'Ring.stl', mode: 'saved' });
    });
    expect(screen.getByText('Ring saved · Ring.stl')).toBeTruthy();

    act(() => useRingStore.getState().setError('boom'));
    expect(screen.getByText('Ring export failed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(useRingStore.getState().error).toBeNull();
  });
});

describe('RingGuideSheet', () => {
  it('opens and closes, solid variant', () => {
    render(<RingEditor />);
    expect(screen.queryByText('Solid ring · printing & lighting')).toBeNull();

    fireEvent.click(screen.getByTestId('ringAssemblyGuide'));
    expect(screen.getByText('Solid ring · printing & lighting')).toBeTruthy();
    expect(screen.getByText('1 · Choose a print size')).toBeTruthy();
    expect(screen.getByText('4 · Check the printed prototype')).toBeTruthy();
    expect(screen.getByText(/^Mount the 8 mm strip upright/)).toBeTruthy();
    expect(screen.queryByText('5 · Add the light')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Solid ring · printing & lighting')).toBeNull();
  });

  it('flat channel text in the solid variant', () => {
    render(<RingEditor />);
    fireEvent.change(lightMount(), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('ringAssemblyGuide'));
    expect(screen.getByText(/^The flat circular channel needs a strip designed to bend sideways/)).toBeTruthy();
  });

  it('opens and closes, six-section variant', () => {
    render(<RingEditor />);
    construction('Six sections');
    fireEvent.click(screen.getByTestId('ringAssemblyGuide'));
    expect(screen.getByText('Six-section ring · assembly')).toBeTruthy();
    expect(screen.getByText('5 · Add the light')).toBeTruthy();
    expect(screen.getByText(/^Install the 8 mm strip upright against the green mounting face/)).toBeTruthy();
    expect(screen.getByText('The ZIP includes detailed assembly notes, exact dimensions and print quantities.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Six-section ring · assembly')).toBeNull();
  });
});

describe('diagrams', () => {
  it('the LED reflector draws without NaN for every default and preset', () => {
    for (const parameters of [core.ring.defaults, core.ring.presets.solid, core.ring.presets.large]) {
      const { unmount } = render(<LEDReflectorDiagram parameters={core.ring.normalize({ ...parameters, reflectedLED: true })} />);
      expectFiniteDrawing(screen.getByTestId('ledReflectorDiagram'));
      unmount();
    }
    const flat = render(<LEDReflectorDiagram parameters={core.ring.normalize(core.ring.defaults)} />);
    expectFiniteDrawing(screen.getByTestId('ledReflectorDiagram'));
    flat.unmount();
  });

  it('the LED reflector sits inside its canvas, in the Swift scale', () => {
    const p = core.ring.presets.solid;
    render(<LEDReflectorDiagram parameters={p} />);
    const d = core.ring.derived(p);
    const svg = screen.getByTestId('ledReflectorDiagram');
    expect(svg.getAttribute('viewBox')).toBe('0 0 244 123');
    const strip = svg.querySelector('rect')!;
    const scale = Math.min(228 / p.bandWidth, 95 / d.totalHeight);
    expect(Number(strip.getAttribute('width'))).toBeCloseTo(p.stripThickness * scale, 9);
    expect(Number(strip.getAttribute('height'))).toBeCloseTo(p.stripWidth * scale, 9);
    expect(Number(strip.getAttribute('x'))).toBeGreaterThan(0);
    expect(Number(strip.getAttribute('x')) + Number(strip.getAttribute('width'))).toBeLessThan(244);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^Radial cross section/);
    expect(screen.getByText('UPWARD LIGHT · CROSS SECTION')).toBeTruthy();
    expect(screen.getByText('Ring centre')).toBeTruthy();
    expect(screen.getByText('Outer wall · LED')).toBeTruthy();
  });

  it('the cord diagrams draw without NaN and carry the Swift labels', () => {
    render(<SeparateCordDiagram />);
    render(<ContinuousCordDiagram />);
    const separate = screen.getByTestId('separateCordDiagram');
    const continuous = screen.getByTestId('continuousCordDiagram');
    expectFiniteDrawing(separate);
    expectFiniteDrawing(continuous);
    expect(separate.getAttribute('aria-label')).toMatch(/^Six attachment holes alternate/);
    expect(continuous.getAttribute('aria-label')).toMatch(/^Suspension schematic/);
    // Three ceiling cords, three balloon cords; six holes, three balloons, one hook.
    expect(separate.querySelectorAll('line')).toHaveLength(6);
    expect(separate.querySelectorAll('circle')).toHaveLength(7);
    expect(continuous.querySelectorAll('polyline')).toHaveLength(3);
  });
});
