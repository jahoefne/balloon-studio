import type { WallLampKind } from '../../core/types';
import { useCloudStore, useSunStore } from '../../stores';
import { CloudEditorView } from './CloudEditorView';
import type { CloudExportRequest } from './presentation';

export type { CloudExportRequest } from './presentation';

export interface CloudEditorProps {
  kind: WallLampKind;
  /** Starts the save dialog (WP-U9). Without it, the footer shows the panel's text. */
  onExport?: ((request: CloudExportRequest) => void) | undefined;
}

/** The Cloud and Sun tabs. View state is the tab's own, like SwiftUI `@State`, so each kind gets its own instance. */
export default function CloudEditor({ kind, onExport }: CloudEditorProps) {
  return <CloudEditorView key={kind} store={kind === 'sun' ? useSunStore : useCloudStore} onExport={onExport} />;
}
