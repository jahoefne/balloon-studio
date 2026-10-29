// Web counterpart of the Mac's `.commitBalloonEditing` notification plus
// `makeFirstResponder(nil)`: a number field commits its text when it loses focus, so
// blurring it before Export, Reset, a tab switch, a preset or Open makes the pending
// value land in the (synchronous) store before anyone takes a snapshot.

const nonTextInputTypes = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** True for elements that hold typed text which only commits on blur. */
export function isTextEntry(element: Element | null): element is HTMLElement {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return !nonTextInputTypes.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * Commits the field that is being edited by blurring it. Buttons, sliders and other
 * controls keep their focus: they commit on change, and keyboard users keep their place.
 */
export function commitEditing(doc: Document = document): void {
  const active = doc.activeElement;
  if (isTextEntry(active)) active.blur();
}
