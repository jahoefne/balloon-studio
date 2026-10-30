import { useId, useState } from 'react';
import { printfFixed } from '../core/swift/format';
import type { MeshBuffers } from '../core/types';
import { calibrated, Stage } from '../preview';
import { useAppStore, useImportStore, type StlReview } from '../stores';
import { Button, Checkbox, Dialog } from '../ui';
import './open.css';

// STLImportReviewView (STLImportView.swift:71-116).

const PREVIEW_COLOR = calibrated(0.86, 0.43, 0.18);

export function ImportReviewDialog() {
  const review = useImportStore((state) => state.review);
  const titleId = useId();
  const cancel = () => useImportStore.getState().setReview(null);
  return (
    <Dialog open={review !== null} onCancel={cancel} onDefault={() => useAppStore.getState().acceptReview()} labelledBy={titleId} className="open-review" testId="importReview">
      {review !== null && <ReviewContent review={review} titleId={titleId} onCancel={cancel} />}
    </Dialog>
  );
}

function ReviewContent({ review, titleId, onCancel }: { review: StlReview; titleId: string; onCancel: () => void }) {
  const { name, imported } = review;
  const [wireframe, setWireframe] = useState(false);
  const [resetCamera, setResetCamera] = useState(0);
  const previewProps = { wireframe, resetCamera };
  return (
    <>
      <h2 id={titleId} className="open-review__title">
        {imported.restoredSettings ? 'Open editable balloon' : 'Review reconstructed balloon'}
      </h2>
      <p className="open-review__name" title={name}>
        {name}
      </p>
      <p className="open-review__notes">{imported.notes}</p>
      <div className="open-review__previews">
        <Preview title="Opened STL" mesh={imported.mesh} {...previewProps} />
        <Preview title="Editable balloon" mesh={imported.editable} {...previewProps} />
      </div>
      <div className="open-review__row">
        <Checkbox checked={wireframe} onChange={setWireframe}>
          Wireframe
        </Checkbox>
        <Button onClick={() => setResetCamera(resetCamera + 1)}>Reset views</Button>
        <span className="open-review__settings">{imported.restoredSettings ? 'Recovered settings' : 'Estimated settings · review before editing'}</span>
      </div>
      <p className="open-review__hint">
        Continue to adjust the balloon’s shape, hollow walls, string holes, hanging loop, and patterns. This replaces the current balloon settings. The source file stays unchanged
        until you explicitly export over it.
      </p>
      <div className="open-review__actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="prominent" testId="useEditableBalloon" data-autofocus onClick={() => useAppStore.getState().acceptReview()}>
          Use Editable Balloon
        </Button>
      </div>
    </>
  );
}

function Preview({ title, mesh, wireframe, resetCamera }: { title: string; mesh: MeshBuffers; wireframe: boolean; resetCamera: number }) {
  const { x, y, z } = mesh.dimensions;
  return (
    <div className="open-review__preview">
      <h3 className="open-review__preview-title">{title}</h3>
      <div className="open-review__stage">
        <Stage mesh={mesh} geometryKey="0" color={PREVIEW_COLOR} showPlate wireframe={wireframe} resetCamera={resetCamera} cutaway={false} inspectOpening={false} neckDiameter={32} />
      </div>
      <p className="open-review__size">
        {printfFixed(x, 1)} × {printfFixed(y, 1)} × {printfFixed(z, 1)} mm
      </p>
    </div>
  );
}
