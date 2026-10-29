import { useEffect, useRef } from 'react';
import { isTextEntry } from './commitEditing';
import { isApplePlatform } from './platform';

// App-wide keyboard shortcuts (docs/plan.md, Abschnitt 6): Export Mod+E, Open Mod+O,
// Reset Alt+N (⌥N), because the browser keeps Mod+N for a new window. Mod is ⌘ on Apple
// platforms and Ctrl elsewhere. The handlers commit editing themselves where Swift posts
// `.commitBalloonEditing`.

export type GlobalShortcut = 'export' | 'open' | 'reset';

export interface GlobalShortcutHandlers {
  onExport?: () => void;
  onOpen?: () => void;
  onReset?: () => void;
}

function letter(event: KeyboardEvent): string {
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase();
  // Non-Latin layouts: fall back to the physical key.
  return /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : '';
}

/** Which shortcut a keydown is, if any. Pure, so it is easy to test. */
export function matchShortcut(event: KeyboardEvent, apple: boolean): GlobalShortcut | null {
  if (event.isComposing || event.repeat) return null;
  const mod = apple ? event.metaKey : event.ctrlKey;
  const otherMod = apple ? event.ctrlKey : event.metaKey;
  if (mod && !otherMod && !event.altKey && !event.shiftKey) {
    const key = letter(event);
    if (key === 'e') return 'export';
    if (key === 'o') return 'open';
    return null;
  }
  // Option+N types a dead key on a Mac keyboard, so match the physical key, and leave
  // text fields alone: there it composes ñ.
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'KeyN') {
    const target = event.target instanceof Element ? event.target : null;
    return isTextEntry(target) ? null : 'reset';
  }
  return null;
}

/** True while any modal `<dialog>` is shown; the Mac disables menu commands under a sheet. */
export function isDialogOpen(doc: Document = document): boolean {
  return doc.querySelector('dialog[open]') !== null;
}

/**
 * Listens on `window` in the capture phase so the page sees the keys before any control,
 * prevents the browser default (⌘E find, ⌘O open file) and calls the matching handler.
 * While a dialog is open the shortcut is swallowed but not run.
 */
export function useGlobalShortcuts(handlers: GlobalShortcutHandlers, apple: boolean = isApplePlatform()): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const shortcut = matchShortcut(event, apple);
      if (!shortcut) return;
      event.preventDefault();
      if (isDialogOpen()) return;
      const { onExport, onOpen, onReset } = latest.current;
      if (shortcut === 'export') onExport?.();
      else if (shortcut === 'open') onOpen?.();
      else onReset?.();
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [apple]);
}
