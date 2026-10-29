// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AlertDialog } from './AlertDialog';
import { Dialog } from './Dialog';
import { ParameterControl } from './ParameterControl';
import { Sheet } from './Sheet';

function ExportLike({ onSave, onCancelled }: { onSave: () => void; onCancelled: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      label="Export Balloon STL"
      onCancel={() => {
        onCancelled();
        setOpen(false);
      }}
      onDefault={() => {
        onSave();
        setOpen(false);
      }}
    >
      <input aria-label="File name" defaultValue="Balloon-180x220mm.stl" data-autofocus />
      <ParameterControl title="Rows" value={2} onChange={() => {}} range={[1, 6]} />
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </Dialog>
  );
}

function dialogElement() {
  return document.querySelector('dialog') as HTMLDialogElement;
}

describe('Dialog', () => {
  it('opens modally and focuses the data-autofocus element', () => {
    render(<ExportLike onSave={() => {}} onCancelled={() => {}} />);
    expect(dialogElement().open).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'File name' }));
  });

  it('closes on Escape through onCancel', async () => {
    const user = userEvent.setup();
    const onCancelled = vi.fn();
    render(<ExportLike onSave={() => {}} onCancelled={onCancelled} />);
    await user.keyboard('{Escape}');
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(dialogElement().open).toBe(false);
    expect(screen.queryByRole('textbox', { name: 'File name' })).toBeNull();
  });

  it('turns a native cancel request into onCancel and stays controlled', () => {
    const onCancelled = vi.fn();
    render(<ExportLike onSave={() => {}} onCancelled={onCancelled} />);
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialogElement(), cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(dialogElement().open).toBe(false);
  });

  it('runs the default action on Enter in a text field', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ExportLike onSave={onSave} onCancelled={() => {}} />);
    await user.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(dialogElement().open).toBe(false);
  });

  it('leaves Enter to a focused button and to a number field that commits', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ExportLike onSave={onSave} onCancelled={() => {}} />);
    await user.click(screen.getByRole('textbox', { name: 'Rows' }));
    await user.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'Cancel' }).focus();
    await user.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    expect(dialogElement().open).toBe(false);
  });

  it('closes when open turns false', () => {
    const { rerender } = render(
      <Dialog open label="Test" onCancel={() => {}}>
        <p>Body</p>
      </Dialog>,
    );
    expect(dialogElement().open).toBe(true);
    rerender(
      <Dialog open={false} label="Test" onCancel={() => {}}>
        <p>Body</p>
      </Dialog>,
    );
    expect(dialogElement().open).toBe(false);
    expect(screen.queryByText('Body')).toBeNull();
  });
});

describe('AlertDialog', () => {
  it('shows an OK alert that Enter and Escape dismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender } = render(
      <AlertDialog open title="Export failed" message="The disk is full." onDismiss={onDismiss} />,
    );
    const alert = screen.getByRole('alertdialog', { name: 'Export failed' });
    expect(alert).toBeTruthy();
    expect(screen.getByRole('alertdialog', { description: 'The disk is full.' })).toBe(alert);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'OK' }));
    // Enter on the focused OK button activates it.
    await user.keyboard('{Enter}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    rerender(<AlertDialog open={false} title="Export failed" message="The disk is full." onDismiss={onDismiss} />);
    rerender(<AlertDialog open title="Export failed" message="The disk is full." onDismiss={onDismiss} />);
    fireEvent.keyDown(dialogElement(), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('runs the cancel action on Escape and the default action on Enter', () => {
    const onDelete = vi.fn();
    const onKeep = vi.fn();
    const onDismiss = vi.fn();
    render(
      <AlertDialog
        open
        title="Replace settings?"
        actions={[
          { label: 'Keep', role: 'cancel', onSelect: onKeep },
          { label: 'Replace', role: 'default', onSelect: onDelete },
        ]}
        onDismiss={onDismiss}
      />,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Replace' }));
    fireEvent.keyDown(dialogElement(), { key: 'Escape' });
    expect(onKeep).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialogElement(), { key: 'Enter' });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});

describe('Sheet', () => {
  it('has a title, a Done button and closes on Escape', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(
      <Sheet open title="Cloud lamp · printing & assembly" onDone={onDone} width={700} height={650}>
        <p>Instructions</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Cloud lamp · printing & assembly' })).toBeTruthy();
    expect(dialogElement().style.width).toContain('700px');
    expect(dialogElement().style.height).toContain('650px');
    await user.keyboard('{Escape}');
    expect(onDone).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
