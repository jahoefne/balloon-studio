import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import './primitives.css';

// Modal dialog on the native `<dialog>` with `showModal()` (docs/plan.md, Abschnitt 6,
// Dialoge). Controlled by `open`. Esc and other close requests call `onCancel` (the
// `.cancelAction` button); Enter calls `onDefault` (the `.defaultAction` button) unless a
// focused button, link, select or text area handles Enter itself, or a control inside
// already handled it (`preventDefault`). Children render only while open; an element
// marked `data-autofocus` receives focus when the dialog opens.

export interface DialogProps {
  open: boolean;
  onCancel: () => void;
  onDefault?: (() => void) | undefined;
  children: ReactNode;
  role?: 'dialog' | 'alertdialog' | undefined;
  labelledBy?: string | undefined;
  describedBy?: string | undefined;
  label?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  testId?: string | undefined;
}

const nativeEnterTargets = new Set(['BUTTON', 'A', 'SELECT', 'TEXTAREA', 'SUMMARY']);

export function Dialog({
  open,
  onCancel,
  onDefault,
  children,
  role = 'dialog',
  labelledBy,
  describedBy,
  label,
  className,
  style,
  testId,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);

  useLayoutEffect(() => {
    openRef.current = open;
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      // Handled here so the browser does not also close the dialog behind React's back.
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Enter' || !onDefault) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (nativeEnterTargets.has(target.tagName) || target.isContentEditable) return;
    event.preventDefault();
    onDefault();
  }

  const classes = className ? `ui-dialog ${className}` : 'ui-dialog';
  return (
    <dialog
      ref={ref}
      className={classes}
      style={style}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={label}
      data-testid={testId}
      onKeyDown={onKeyDown}
      onCancel={(event) => {
        // Other close requests (Android back, CloseWatcher): keep `open` the source of truth.
        event.preventDefault();
        onCancel();
      }}
      onClose={() => {
        if (openRef.current) onCancel();
      }}
    >
      {open && children}
    </dialog>
  );
}
