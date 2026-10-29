// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { commitEditing } from './commitEditing';
import { altKeyLabel, isApplePlatform, modKeyLabel } from './platform';
import { useGlobalShortcuts, type GlobalShortcutHandlers } from './shortcuts';

function Harness({
  handlers,
  apple,
  dialog = false,
}: {
  handlers: GlobalShortcutHandlers;
  apple: boolean;
  dialog?: boolean;
}) {
  useGlobalShortcuts(handlers, apple);
  return (
    <>
      <input aria-label="Balloon text" />
      {dialog && <dialog open>Export</dialog>}
    </>
  );
}

function press(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('useGlobalShortcuts', () => {
  it('runs Export on ⌘E (Apple) and prevents the browser default', () => {
    const onExport = vi.fn();
    render(<Harness handlers={{ onExport }} apple />);
    const event = press({ key: 'e', code: 'KeyE', metaKey: true });
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    press({ key: 'e', code: 'KeyE', ctrlKey: true });
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('runs Export on Ctrl+E and Open on Ctrl+O elsewhere', () => {
    const onExport = vi.fn();
    const onOpen = vi.fn();
    render(<Harness handlers={{ onExport, onOpen }} apple={false} />);
    expect(press({ key: 'e', code: 'KeyE', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: 'o', code: 'KeyO', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    press({ key: 'e', code: 'KeyE', metaKey: true });
    press({ key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true });
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('matches the physical key on non-Latin layouts and skips auto-repeat', () => {
    const onExport = vi.fn();
    render(<Harness handlers={{ onExport }} apple />);
    press({ key: 'у', code: 'KeyE', metaKey: true });
    press({ key: 'e', code: 'KeyE', metaKey: true, repeat: true });
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('runs Reset on Alt+N by physical key, but not while typing in a text field', () => {
    const onReset = vi.fn();
    const { getByLabelText } = render(<Harness handlers={{ onReset }} apple />);
    const event = press({ key: 'Dead', code: 'KeyN', altKey: true });
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    const typing = press({ key: 'Dead', code: 'KeyN', altKey: true }, getByLabelText('Balloon text'));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(typing.defaultPrevented).toBe(false);
  });

  it('swallows shortcuts without running them while a dialog is open', () => {
    const handlers = { onExport: vi.fn(), onOpen: vi.fn(), onReset: vi.fn() };
    render(<Harness handlers={handlers} apple dialog />);
    expect(press({ key: 'e', code: 'KeyE', metaKey: true }).defaultPrevented).toBe(true);
    press({ key: 'o', code: 'KeyO', metaKey: true });
    press({ key: 'Dead', code: 'KeyN', altKey: true });
    expect(handlers.onExport).not.toHaveBeenCalled();
    expect(handlers.onOpen).not.toHaveBeenCalled();
    expect(handlers.onReset).not.toHaveBeenCalled();
  });

  it('sees the key before controls that stop propagation, and uses the latest handlers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, getByLabelText } = render(<Harness handlers={{ onExport: first }} apple />);
    rerender(<Harness handlers={{ onExport: second }} apple />);
    const input = getByLabelText('Balloon text');
    input.addEventListener('keydown', (event) => event.stopPropagation());
    press({ key: 'e', code: 'KeyE', metaKey: true }, input);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops listening on unmount', () => {
    const onExport = vi.fn();
    const { unmount } = render(<Harness handlers={{ onExport }} apple />);
    unmount();
    press({ key: 'e', code: 'KeyE', metaKey: true });
    expect(onExport).not.toHaveBeenCalled();
  });
});

describe('platform labels', () => {
  it('detects Apple platforms', () => {
    expect(isApplePlatform({ platform: 'MacIntel' })).toBe(true);
    expect(isApplePlatform({ userAgentData: { platform: 'macOS' } })).toBe(true);
    expect(isApplePlatform({ platform: 'iPad' })).toBe(true);
    expect(isApplePlatform({ platform: 'Win32' })).toBe(false);
    expect(isApplePlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(false);
    expect(isApplePlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe(true);
    expect(isApplePlatform(undefined)).toBe(false);
  });

  it('labels the modifier keys', () => {
    expect(`${modKeyLabel(true)}E`).toBe('⌘E');
    expect(`${modKeyLabel(false)}E`).toBe('Ctrl+E');
    expect(`${altKeyLabel(true)}N`).toBe('⌥N');
    expect(`${altKeyLabel(false)}N`).toBe('Alt+N');
  });
});

describe('commitEditing', () => {
  it('blurs a focused text field so it commits', () => {
    const onBlur = vi.fn();
    const { getByLabelText } = render(<input aria-label="Height" onBlur={onBlur} />);
    const input = getByLabelText('Height') as HTMLInputElement;
    input.focus();
    commitEditing();
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input);
  });

  it('leaves buttons and sliders focused', () => {
    const { getByRole } = render(
      <>
        <button type="button">Export</button>
        <input type="range" aria-label="Height slider" />
      </>,
    );
    const button = getByRole('button');
    button.focus();
    commitEditing();
    expect(document.activeElement).toBe(button);
    const range = getByRole('slider');
    fireEvent.focus(range);
    range.focus();
    commitEditing();
    expect(document.activeElement).toBe(range);
  });
});
