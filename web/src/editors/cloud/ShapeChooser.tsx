import { useMemo, type ReactNode } from 'react';
import { CLOUD_STYLE_INFO, CLOUD_STYLES, SUN_STYLE_INFO, SUN_STYLES, type CloudParameters, type CloudStyle, type SunStyle } from '../../core/types';
import { Checkbox, Icon, SectionLabel } from '../../ui';
import { CLOUD_BOX, cloudSilhouettePath, sunSilhouettePath, SUN_BOX, type SilhouetteBox } from './silhouette';

// `sunShapeChooser` and `shapeChooser` (CloudEditor.swift:321-383).

function Silhouette({ path, box, className }: { path: string; box: SilhouetteBox; className: string }) {
  return (
    <svg className={`cloud-card__shape ${className}`} viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}

interface ShapeCardProps {
  selected: boolean;
  title: string;
  caption: string;
  label: string;
  testId: string;
  onSelect: () => void;
  children: ReactNode;
}

function ShapeCard({ selected, title, caption, label, testId, onSelect, children }: ShapeCardProps) {
  return (
    <button type="button" className="cloud-card" aria-pressed={selected} aria-label={label} data-testid={testId} onClick={onSelect}>
      {children}
      <span className="cloud-card__title">
        <span>{title}</span>
        {selected && <Icon name="checkmark.circle.fill" size={11} />}
      </span>
      <span className="cloud-card__caption">{caption}</span>
    </button>
  );
}

function SunCard({ style, selected, onSelect }: { style: SunStyle; selected: boolean; onSelect: () => void }) {
  const info = SUN_STYLE_INFO[style];
  const path = useMemo(() => sunSilhouettePath(style), [style]);
  return (
    <ShapeCard selected={selected} title={info.title} caption={info.note} label={`${info.title} sun, ${info.subtitle}`} testId={`sunStyle-${style}`} onSelect={onSelect}>
      <Silhouette path={path} box={SUN_BOX} className="cloud-card__shape--sun" />
    </ShapeCard>
  );
}

function CloudCard({ style, mirrored, selected, onSelect }: { style: CloudStyle; mirrored: boolean; selected: boolean; onSelect: () => void }) {
  const info = CLOUD_STYLE_INFO[style];
  const path = useMemo(() => cloudSilhouettePath(style, mirrored), [style, mirrored]);
  return (
    <ShapeCard selected={selected} title={info.title} caption={info.subtitle} label={`${info.title} cloud, ${info.subtitle}`} testId={`cloudStyle-${style}`} onSelect={onSelect}>
      <Silhouette path={path} box={CLOUD_BOX} className="cloud-card__shape--cloud" />
    </ShapeCard>
  );
}

export function SunShapeChooser({ sunStyle, onSelect }: { sunStyle: SunStyle; onSelect: (style: SunStyle) => void }) {
  return (
    <section className="cloud-section cloud-section--chooser">
      <SectionLabel>FOUR WAYS TO SHINE</SectionLabel>
      <div className="cloud-cards">
        {SUN_STYLES.map((style) => (
          <SunCard key={style} style={style} selected={sunStyle === style} onSelect={() => onSelect(style)} />
        ))}
      </div>
      <p className="cloud-subtitle">{SUN_STYLE_INFO[sunStyle].subtitle}</p>
      <p className="cloud-note">
        Switch designs freely; your dimensions and fittings stay the same. Soft star and Cones share their outline and their back: they differ in the 3D surface. Every other kit has its own matching front and back.
      </p>
    </section>
  );
}

export function CloudShapeChooser({ parameters, onSelect, onMirror }: { parameters: CloudParameters; onSelect: (style: CloudStyle) => void; onMirror: (mirrored: boolean) => void }) {
  return (
    <section className="cloud-section cloud-section--chooser">
      <SectionLabel>SHAPES FOR YOUR SKY</SectionLabel>
      <div className="cloud-cards">
        {CLOUD_STYLES.map((style) => (
          <CloudCard key={style} style={style} mirrored={parameters.mirrored} selected={parameters.style === style} onSelect={() => onSelect(style)} />
        ))}
      </div>
      <Checkbox checked={parameters.mirrored} onChange={onMirror} testId="cloudMirror">
        Mirror silhouette
      </Checkbox>
      <p className="cloud-note">Mix shapes and widths, then mirror a few for a natural sky. Each kit includes its matching front and back.</p>
    </section>
  );
}
