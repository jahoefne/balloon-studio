// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ParameterControl, type ParameterControlProps } from './ParameterControl';

// A parent that owns the value, like a store binding.
function Bound(
  props: Omit<ParameterControlProps, 'value' | 'onChange'> & { initial: number; spy: (v: number) => void },
) {
  const { initial, spy, ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <ParameterControl
      {...rest}
      value={value}
      onChange={(next) => {
        spy(next);
        setValue(next);
      }}
    />
  );
}

function field(title: string) {
  return screen.getByRole('textbox', { name: title }) as HTMLInputElement;
}

function slider(title: string) {
  return screen.getByRole('slider', { name: `${title} slider` }) as HTMLInputElement;
}

describe('ParameterControl', () => {
  it('draws one tick per step under the slider and names the value with its unit', () => {
    const { container } = render(<ParameterControl title="Panel depth" value={4} onChange={() => {}} range={[0, 8]} step={0.5} unit="%" />);
    const ticks = container.querySelector<HTMLElement>('.ui-parameter__ticks');
    expect(ticks?.getAttribute('aria-hidden')).toBe('true');
    expect(ticks?.style.getPropertyValue('--tick-spacing')).toBe(String(0.5 / 8));
    expect(slider('Panel depth').getAttribute('aria-valuetext')).toBe('4 %');
  });

  it('shows title, formatted value, unit, and labels field and slider', () => {
    render(
      <ParameterControl title="Relief depth" value={2.4} onChange={() => {}} range={[1.2, 4]} step={0.1} unit="mm" />,
    );
    expect(screen.getByText('Relief depth')).toBeTruthy();
    expect(screen.getByText('mm')).toBeTruthy();
    const input = field('Relief depth');
    expect(input.value).toBe('2.4');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    const range = slider('Relief depth');
    expect(range.min).toBe('1.2');
    expect(range.max).toBe('4');
    expect(range.step).toBe('0.1');
    expect(range.disabled).toBe(false);
  });

  it('commits "1,25" at step 0.1 on Enter as 1.3 and shows 1.3', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Bound title="Relief depth" initial={2} spy={spy} range={[1.2, 4]} step={0.1} unit="mm" />);
    const input = field('Relief depth');
    await user.clear(input);
    await user.type(input, '1,25{Enter}');
    expect(spy).toHaveBeenCalledTimes(1);
    // (1.25 / 0.1).rounded() * 0.1 is exactly 1.3 in Double, as in Swift.
    expect(spy).toHaveBeenCalledWith(1.3);
    expect(input.value).toBe('1.3');
    expect(document.activeElement).not.toBe(input);
  });

  it('reverts unparsable text to the current value without calling onChange', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Bound title="Rows" initial={2} spy={spy} range={[1, 6]} />);
    const input = field('Rows');
    await user.clear(input);
    await user.type(input, 'abc{Enter}');
    expect(spy).not.toHaveBeenCalled();
    expect(input.value).toBe('2');
  });

  it('clamps to the upper and lower bound', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<Bound title="Widest diameter" initial={180} spy={spy} range={[60, 240]} unit="mm" />);
    const input = field('Widest diameter');
    await user.clear(input);
    await user.type(input, '999{Enter}');
    expect(spy).toHaveBeenLastCalledWith(240);
    expect(input.value).toBe('240');
    await user.clear(input);
    await user.type(input, '-5{Enter}');
    expect(spy).toHaveBeenLastCalledWith(60);
    expect(input.value).toBe('60');
  });

  it('commits on blur and rounds to the step, halves away from zero', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(
      <>
        <Bound title="Vertical panels" initial={12} spy={spy} range={[8, 32]} step={4} />
        <button type="button">elsewhere</button>
      </>,
    );
    const input = field('Vertical panels');
    await user.clear(input);
    await user.type(input, '18');
    expect(spy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(spy).toHaveBeenCalledWith(20);
    expect(input.value).toBe('20');
  });

  it('keeps the typed text while focused and follows value again after blur', () => {
    const { rerender } = render(<ParameterControl title="Height" value={100} onChange={() => {}} range={[80, 300]} />);
    const input = field('Height');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12' } });
    rerender(<ParameterControl title="Height" value={150} onChange={() => {}} range={[80, 300]} />);
    expect(input.value).toBe('12');
    fireEvent.blur(input);
    rerender(<ParameterControl title="Height" value={160} onChange={() => {}} range={[80, 300]} />);
    expect(input.value).toBe('160');
  });

  it('shows the value the parent keeps after a commit, even if it differs', async () => {
    const user = userEvent.setup();
    // A store that ignores the change keeps showing its own value.
    render(<ParameterControl title="Rows" value={2} onChange={() => {}} range={[1, 6]} />);
    const input = field('Rows');
    await user.clear(input);
    await user.type(input, '5{Enter}');
    expect(input.value).toBe('2');
  });

  it('moves the value with the slider', () => {
    const spy = vi.fn();
    render(<ParameterControl title="Cap height" value={18} onChange={spy} range={[10, 28]} unit="%" />);
    fireEvent.change(slider('Cap height'), { target: { value: '21' } });
    expect(spy).toHaveBeenCalledWith(21);
  });

  it('sets the slider maximum to max(upper, lower + step) and disables equal bounds', () => {
    render(<ParameterControl title="Text height" value={3} onChange={() => {}} range={[3, 3]} unit="mm" />);
    const range = slider('Text height');
    expect(range.max).toBe('4');
    expect(range.disabled).toBe(true);
  });

  it('turns help into a tooltip and a description', () => {
    const help = '8 to 32 panels, in groups of four, for a symmetric envelope.';
    render(
      <ParameterControl
        title="Vertical panels"
        value={12}
        onChange={() => {}}
        range={[8, 32]}
        step={4}
        help={help}
        testId="panels"
      />,
    );
    expect(screen.getByTestId('panels').getAttribute('title')).toBe(help);
    expect(field('Vertical panels').getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('textbox', { description: help })).toBe(field('Vertical panels'));
    expect(screen.getByRole('slider', { description: help })).toBe(slider('Vertical panels'));
  });

  it('formats with as many digits as the step needs', () => {
    render(<ParameterControl title="Density (g/cm³)" value={1.24} onChange={() => {}} range={[0.5, 2]} step={0.01} />);
    expect(field('Density (g/cm³)').value).toBe('1.24');
  });
});
