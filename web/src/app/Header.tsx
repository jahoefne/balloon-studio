import { useId, useState } from 'react';
import { OPEN_PANEL_MESSAGE } from '../open/DropZone';
import { STUDIO_PARTS, useAppStore, useImportStore } from '../stores';
import { altKeyLabel, Button, Dialog, Icon, SegmentedControl } from '../ui';

// ContentView's `header` (BalloonStudioApp.swift:352-379). The web adds what the Mac's menu bar
// holds: "Reset part" (Reset Current Part, :238-250) and the About panel (:264-272), opened from
// the mark.

export function Header({ onOpen }: { onOpen: () => void }) {
  const part = useAppStore((state) => state.part);
  const selectPart = useAppStore((state) => state.selectPart);
  const resetCurrentPart = useAppStore((state) => state.resetCurrentPart);
  const loading = useImportStore((state) => state.loading);
  const reviewing = useImportStore((state) => state.review !== null);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <header className="app-header">
      <button type="button" className="app-header__mark" title="About Balloon Studio" aria-label="About Balloon Studio" onClick={() => setAboutOpen(true)}>
        <Icon name="balloon.fill" size={24} />
      </button>
      <div className="app-header__title">
        <h1 className="app-header__name">Balloon Studio</h1>
        <p className="app-header__subtitle">A little shape. A lot of possibility.</p>
      </div>
      <SegmentedControl
        label="Part"
        className="app-header__parts"
        testId="studioPart"
        options={STUDIO_PARTS.map(({ key, title }) => ({ value: key, label: title }))}
        value={part}
        onChange={selectPart}
      />
      <Button testId="openFile" title={OPEN_PANEL_MESSAGE} disabled={loading || reviewing} onClick={onOpen}>
        <Icon name="folder" size={13} />
        {loading ? 'Opening…' : 'Open…'}
      </Button>
      <Button testId="resetPart" title={`Reset Current Part (${altKeyLabel()}N)`} onClick={resetCurrentPart}>
        <Icon name="arrow.counterclockwise" size={13} />
        Reset part
      </Button>
      <span className="app-header__printer">
        <Icon name="printer" size={13} />
        Made for your P2S
      </span>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </header>
  );
}

function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  return (
    <Dialog open={open} onCancel={onClose} onDefault={onClose} labelledBy={titleId} className="app-about">
      <span className="app-header__mark app-about__mark" aria-hidden="true">
        <Icon name="balloon.fill" size={24} />
      </span>
      <h2 id={titleId} className="app-about__name">
        Balloon Studio
      </h2>
      <p className="app-about__version">Version {__APP_VERSION__}</p>
      <p className="app-about__credits">
        Parametric balloons, baskets, mobile rings, hanging figures, cloud and sun lamps and cable clips for 3D printing.
        <br />
        Built for the Bambu Lab P2S.
        <br />
        All dimensions are in millimetres.
      </p>
      <Button variant="prominent" data-autofocus onClick={onClose}>
        OK
      </Button>
    </Dialog>
  );
}
