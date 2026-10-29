import {
  ArrowUpDown,
  Cable,
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  Contrast,
  Cylinder,
  Folder,
  Info,
  Layers,
  Lightbulb,
  Link,
  Package,
  Pointer,
  Printer,
  RefreshCw,
  RotateCcw,
  Scan,
  ShoppingBasket,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import './primitives.css';

// SF Symbols used by the Mac app → lucide icons (docs/plan.md, WP-U1). `balloon.fill` has
// no lucide counterpart and is drawn by `BalloonMark`.

const symbols = {
  folder: Folder,
  printer: Printer,
  lightbulb: Lightbulb,
  'circle.dashed': CircleDashed,
  'circle.fill': Circle,
  'square.and.arrow.up': Upload,
  checkmark: Check,
  'checkmark.circle.fill': CircleCheck,
  viewfinder: Scan,
  'arrow.counterclockwise': RotateCcw,
  'exclamationmark.triangle': TriangleAlert,
  'info.circle': Info,
  link: Link,
  basket: ShoppingBasket,
  cylinder: Cylinder,
  shippingbox: Package,
  'arrow.triangle.2.circlepath': RefreshCw,
  'circle.lefthalf.filled': Contrast,
  'square.stack.3d.up': Layers,
  'cable.connector.horizontal': Cable,
  'hand.tap': Pointer,
  'arrow.up.and.down': ArrowUpDown,
} as const satisfies Record<string, LucideIcon>;

export type SymbolName = keyof typeof symbols | 'balloon.fill';

export const SYMBOL_NAMES = [...(Object.keys(symbols) as (keyof typeof symbols)[]), 'balloon.fill'] as const;

export interface IconProps {
  name: SymbolName;
  size?: number | undefined;
  /** Gives the icon an accessible name; otherwise it is decorative. */
  label?: string | undefined;
  className?: string | undefined;
}

export function Icon({ name, size = 14, label, className }: IconProps) {
  const classes = className ? `ui-icon ${className}` : 'ui-icon';
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  if (name === 'balloon.fill') return <BalloonMark size={size} className={classes} {...a11y} />;
  const Glyph = symbols[name];
  // SF's filled variants: fill the dot so "Live preview" reads as a status light.
  const fill = name === 'circle.fill' ? 'currentColor' : 'none';
  return <Glyph size={size} className={classes} fill={fill} data-symbol={name} {...a11y} />;
}

interface BalloonMarkProps {
  size?: number;
  className?: string;
  role?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
}

/** `balloon.fill`: a filled balloon with its knot and a curling string. */
export function BalloonMark({ size = 24, className, ...a11y }: BalloonMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} data-symbol="balloon.fill" {...a11y}>
      <path
        fill="currentColor"
        d="M12 1.6c-4.3 0-7.3 3.3-7.3 7.5 0 4.6 3.7 8.6 6.4 9.6h1.8c2.7-1 6.4-5 6.4-9.6 0-4.2-3-7.5-7.3-7.5Z"
      />
      <path fill="currentColor" d="M10.5 19.4h3l-.7 1.4h-1.6Z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" d="M12 20.8c-.9.6-.9 1.2 0 1.7" />
      <path fill="rgb(255 255 255 / 0.45)" d="M8.6 6.2c.7-1.6 2-2.5 3.5-2.7-.6.7-1.5 2.2-1.8 3.9-.6.4-1.3.2-1.7-1.2Z" />
    </svg>
  );
}
