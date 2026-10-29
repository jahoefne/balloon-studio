// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdviceRow } from './AdviceRow';
import { Checkbox } from './Checkbox';
import { ColorPicker } from './ColorPicker';
import { PrimitivesDemo } from './demo/PrimitivesDemo';
import { DisclosureGroup } from './DisclosureGroup';
import { FILAMENT_SWATCHES, type FilamentColorName } from './filamentColors';
import { BALLOON_TEXT_FONTS, balloonTextFontStyle } from './fonts';
import { Icon, SYMBOL_NAMES } from './Icon';
import { Metric, MetricRow } from './Metric';
import { SectionLabel } from './SectionLabel';
import { SegmentedControl } from './SegmentedControl';
import { Select } from './Select';
import { Switch } from './Switch';

const parts = ['Balloon', 'Basket', 'Ring', 'Cloud', 'Sun', 'Figures', 'Cable clip'] as const;
type Part = (typeof parts)[number];

function PartPicker({ spy, disabled = [] }: { spy: (part: Part) => void; disabled?: Part[] }) {
  const [part, setPart] = useState<Part>('Balloon');
  return (
    <SegmentedControl<Part>
      label="Part"
      options={parts.map((value) => ({ value, label: value, disabled: disabled.includes(value) }))}
      value={part}
      onChange={(next) => {
        spy(next);
        setPart(next);
      }}
      testId="part"
    />
  );
}

describe('SegmentedControl', () => {
  it('is a radio group with one tab stop on the selected segment', () => {
    render(<PartPicker spy={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: 'Part' });
    expect(group.getAttribute('data-testid')).toBe('part');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual([...parts]);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', ...Array(6).fill('false')]);
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
  });

  it('selects on click and moves with the arrow keys, wrapping and skipping disabled', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<PartPicker spy={spy} disabled={['Basket']} />);
    await user.click(screen.getByRole('radio', { name: 'Ring' }));
    expect(spy).toHaveBeenLastCalledWith('Ring');
    await user.keyboard('{ArrowLeft}');
    expect(spy).toHaveBeenLastCalledWith('Balloon');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Balloon' }));
    await user.keyboard('{ArrowLeft}');
    expect(spy).toHaveBeenLastCalledWith('Cable clip');
    await user.keyboard('{ArrowRight}');
    expect(spy).toHaveBeenLastCalledWith('Balloon');
    await user.keyboard('{ArrowDown}');
    expect(spy).toHaveBeenLastCalledWith('Ring');
    await user.keyboard('{End}');
    expect(spy).toHaveBeenLastCalledWith('Cable clip');
    await user.keyboard('{Home}');
    expect(spy).toHaveBeenLastCalledWith('Balloon');
    expect(screen.getByRole('radio', { name: 'Balloon' }).getAttribute('aria-checked')).toBe('true');
  });

  it('does not report a click on the selected segment as a change', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<PartPicker spy={spy} />);
    await user.click(screen.getByRole('radio', { name: 'Balloon' }));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Select', () => {
  it('renders a labelled native select and maps numeric values', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    const heights = [0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32];
    render(
      <Select<number>
        label="Layer height"
        options={heights.map((value) => ({ value, label: `${value.toFixed(2)} mm` }))}
        value={0.2}
        onChange={spy}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Layer height' }) as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe('0.20 mm');
    await user.selectOptions(select, '0.12 mm');
    expect(spy).toHaveBeenCalledWith(0.12);
  });

  it('can hide its label and style every option, as the Font picker does', () => {
    render(
      <Select
        label="Font"
        labelHidden
        rich
        options={BALLOON_TEXT_FONTS.map((font) => ({ value: font, label: font, style: balloonTextFontStyle(font) }))}
        value="Serif"
        onChange={() => {}}
        testId="balloonTextFont"
      />,
    );
    const select = screen.getByTestId('balloonTextFont') as HTMLSelectElement;
    expect(screen.queryByText('Font', { selector: 'label' })).toBeNull();
    expect(select.getAttribute('aria-label')).toBe('Font');
    expect(select.style.fontFamily).toContain('Gelasio');
    const options = Array.from(select.options);
    expect(options.map((option) => option.textContent)).toEqual([
      'Rounded',
      'Sans serif',
      'Serif',
      'Handwritten',
      'Monospaced',
    ]);
    expect(options[0]?.style.fontFamily).toContain('Nunito');
    expect(options[4]?.style.fontFamily).toContain('DejaVu Sans Mono');
    expect(options.every((option) => option.style.fontWeight === '700')).toBe(true);
  });
});

describe('ColorPicker', () => {
  function Picker({ spy }: { spy: (value: FilamentColorName) => void }) {
    const [value, setValue] = useState<FilamentColorName>('Saffron');
    return (
      <ColorPicker
        label="Base · filament 1"
        value={value}
        onChange={(next) => {
          spy(next);
          setValue(next);
        }}
      />
    );
  }

  it('lists the seven filament colors and paints the swatch', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    const { container } = render(<Picker spy={spy} />);
    const select = screen.getByRole('combobox', { name: 'Base · filament 1' }) as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(
      FILAMENT_SWATCHES.map((color) => color.name),
    );
    const swatch = container.querySelector('.ui-swatch') as HTMLElement;
    expect(swatch.style.backgroundColor).toBe('rgb(219, 110, 46)');
    await user.selectOptions(select, 'Midnight blue');
    expect(spy).toHaveBeenCalledWith('Midnight blue');
    expect(swatch.style.backgroundColor).toBe('rgb(37, 61, 96)');
  });
});

describe('Switch and Checkbox', () => {
  it('reports switch changes and exposes the switch role', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(
      <Switch checked={false} onChange={spy} testId="hollowMode">
        <Icon name="lightbulb" />
        Hollow for LEDs
      </Switch>,
    );
    const toggle = screen.getByRole('switch', { name: 'Hollow for LEDs' });
    expect(toggle.getAttribute('data-testid')).toBe('hollowMode');
    await user.click(screen.getByText('Hollow for LEDs'));
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('reports checkbox changes and carries help', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    const help = 'Preview the cavity. The exported file always contains the complete shell.';
    render(
      <Checkbox checked onChange={spy} help={help}>
        Cutaway
      </Checkbox>,
    );
    const box = screen.getByRole('checkbox', { name: 'Cutaway', description: help });
    await user.click(box);
    expect(spy).toHaveBeenCalledWith(false);
  });
});

describe('DisclosureGroup', () => {
  it('starts collapsed and opens on the summary', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DisclosureGroup title="P2S waste assumptions">
        <p>Inside</p>
      </DisclosureGroup>,
    );
    const details = container.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByText('P2S waste assumptions'));
    fireEvent(details, new Event('toggle'));
    expect(details.open).toBe(true);
  });
});

describe('labels, metrics, advice and icons', () => {
  it('renders a section label as a heading', () => {
    render(<SectionLabel>DIMENSIONS</SectionLabel>);
    expect(screen.getByRole('heading', { level: 3, name: 'DIMENSIONS' })).toBeTruthy();
  });

  it('renders metrics as a description list', () => {
    render(
      <MetricRow>
        <Metric title="DIAMETER" value="180" unit="mm" />
        <Metric title="PANELS" value="12" />
      </MetricRow>,
    );
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['DIAMETER', 'PANELS']);
    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual(['180mm', '12']);
  });

  it('colors the advice icon by tone', () => {
    const { container } = render(
      <AdviceRow icon="exclamationmark.triangle" tone="warning" title="Check supports in your slicer">
        Outward overhang reaches 52° from vertical.
      </AdviceRow>,
    );
    expect(container.firstElementChild?.className).toContain('ui-advice--warning');
    expect(container.querySelector('[data-symbol="exclamationmark.triangle"]')).toBeTruthy();
    expect(screen.getByText('Check supports in your slicer')).toBeTruthy();
  });

  it('renders every mapped SF Symbol, decorative unless labelled', () => {
    const { container } = render(
      <>
        {SYMBOL_NAMES.map((name) => (
          <Icon key={name} name={name} />
        ))}
        <Icon name="arrow.counterclockwise" label="Reset camera" />
      </>,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(SYMBOL_NAMES.length + 1);
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(SYMBOL_NAMES.length);
    expect(screen.getByRole('img', { name: 'Reset camera' })).toBeTruthy();
    expect(container.querySelector('[data-symbol="balloon.fill"]')).toBeTruthy();
  });
});

describe('PrimitivesDemo', () => {
  it('renders every primitive together', () => {
    render(<PrimitivesDemo />);
    expect(screen.getByRole('heading', { name: 'Balloon Studio' })).toBeTruthy();
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(3);
  });
});
