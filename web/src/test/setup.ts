// Shared vitest setup. In jsdom, add the browser APIs jsdom does not implement:
// HTMLDialogElement.showModal/show/close, ResizeObserver and matchMedia
// (URL.createObjectURL follows with WP-U10). Node-environment suites skip all of this.
import { afterEach } from 'vitest';

if (typeof window !== 'undefined') {
  // Testing Library only unmounts automatically when vitest globals are on. Imported
  // lazily so Node suites do not load React DOM.
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());

  const dialog = window.HTMLDialogElement?.prototype;
  if (dialog && typeof dialog.showModal !== 'function') {
    dialog.show = function show(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    dialog.showModal = function showModal(this: HTMLDialogElement) {
      if (this.open) return;
      if (!this.isConnected) throw new DOMException('The dialog is not connected.', 'InvalidStateError');
      this.setAttribute('open', '');
    };
    dialog.close = function close(this: HTMLDialogElement, returnValue?: string) {
      if (!this.open) return;
      this.removeAttribute('open');
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.dispatchEvent(new Event('close'));
    };
  }

  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    });
  }
}
