import { useId, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import './primitives.css';

// SwiftUI `.alert(title, isPresented:) { Button("OK", role:.cancel) {...} } message: {...}`,
// e.g. "Export failed" and "Couldn’t open file". Every button dismisses the alert after
// its action. Esc runs the cancel button; Enter runs the default button, or the only
// button when there is just one (the macOS OK alert).

export interface AlertAction {
  label: string;
  role?: 'cancel' | 'default' | 'destructive' | undefined;
  onSelect?: (() => void) | undefined;
  testId?: string | undefined;
}

export interface AlertDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  actions?: readonly AlertAction[] | undefined;
  onDismiss: () => void;
  testId?: string | undefined;
}

const okOnly: readonly AlertAction[] = [{ label: 'OK', role: 'cancel' }];

export function AlertDialog({ open, title, message, actions = okOnly, onDismiss, testId }: AlertDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const cancelAction = actions.find((action) => action.role === 'cancel');
  const defaultAction =
    actions.find((action) => action.role === 'default') ?? (actions.length === 1 ? actions[0] : undefined);

  function run(action: AlertAction | undefined) {
    action?.onSelect?.();
    onDismiss();
  }

  return (
    <Dialog
      open={open}
      role="alertdialog"
      className="ui-alert"
      labelledBy={titleId}
      describedBy={message === undefined ? undefined : messageId}
      onCancel={() => run(cancelAction)}
      onDefault={() => run(defaultAction)}
      testId={testId}
    >
      <h2 id={titleId} className="ui-alert__title">
        {title}
      </h2>
      {message !== undefined && (
        <div id={messageId} className="ui-alert__message">
          {message}
        </div>
      )}
      <div className="ui-alert__actions">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action === defaultAction ? 'prominent' : 'bordered'}
            className={action.role === 'destructive' ? 'ui-button--destructive' : undefined}
            data-autofocus={action === defaultAction ? true : undefined}
            testId={action.testId}
            onClick={() => run(action)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
