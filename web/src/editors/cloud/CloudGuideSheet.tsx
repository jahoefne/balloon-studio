import { Sheet } from '../../ui';

// The guide sheet of CloudEditor.swift:164-173: the kit's ASSEMBLY.md, verbatim and selectable.

export interface CloudGuideSheetProps {
  open: boolean;
  title: string;
  instructions: string;
  onDone: () => void;
  testId?: string | undefined;
}

export function CloudGuideSheet({ open, title, instructions, onDone, testId }: CloudGuideSheetProps) {
  return (
    <Sheet open={open} title={`${title} lamp · printing & assembly`} onDone={onDone} width={700} height={650} testId={testId}>
      <div className="cloud-guide">{instructions}</div>
    </Sheet>
  );
}
