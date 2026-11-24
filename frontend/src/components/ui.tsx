import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

import type { Photo } from '../lib/api';
import { formatBytes } from '../lib/format';
import { Icon, type IconName } from './icons';

export type Tone = 'brand' | 'pink' | 'green' | 'amber' | 'red' | 'neutral';

const toneSurface: Record<Tone, string> = {
  brand: 'bg-brand/12 text-brand',
  pink: 'bg-pink/12 text-pink',
  green: 'bg-green/12 text-green',
  amber: 'bg-amber/15 text-amber',
  red: 'bg-red/12 text-red',
  neutral: 'bg-alt text-ink2',
};

const toneBar: Record<Tone, string> = {
  brand: 'bg-brand',
  pink: 'bg-pink',
  green: 'bg-green',
  amber: 'bg-amber',
  red: 'bg-red',
  neutral: 'bg-ink3',
};

// ------------------------------------------------------------------ button

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerGhost';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:brightness-110 shadow-soft',
  secondary: 'bg-alt text-ink hover:bg-line',
  outline: 'border border-line bg-transparent text-ink hover:bg-alt',
  ghost: 'text-ink2 hover:bg-alt hover:text-ink',
  danger: 'bg-red text-white hover:brightness-110',
  dangerGhost: 'text-red hover:bg-red/10',
};

const sizes = {
  sm: 'h-8 px-3 text-[12.5px] gap-1.5',
  md: 'h-10 px-4 text-[13.5px] gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof sizes;
  icon?: IconName;
}): ReactNode {
  return (
    <button
      type={type}
      className={`focus-ring inline-flex items-center justify-center rounded-xl font-semibold transition disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink2 transition hover:bg-alt hover:text-ink disabled:pointer-events-none disabled:opacity-40 ${className}`}
      {...rest}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

// ------------------------------------------------------------------- cards

export function Card({
  children,
  className = '',
}: {
  children?: ReactNode;
  className?: string;
}): ReactNode {
  return <div className={`card ${className}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: IconName;
  tone?: Tone;
}): ReactNode {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink3">{label}</p>
          <p className="mt-1.5 text-[22px] font-bold leading-none tracking-tight text-ink">{value}</p>
          {hint ? <p className="mt-1.5 text-[11.5px] text-ink2">{hint}</p> : null}
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneSurface[tone]}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>
    </Card>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[12px] text-ink2">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}): ReactNode {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[23px] font-bold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink2">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- progress

export function Progress({
  value,
  tone = 'brand',
  className = '',
}: {
  value: number;
  tone?: Tone;
  className?: string;
}): ReactNode {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-alt ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${toneBar[tone]}`}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }): ReactNode {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

// ------------------------------------------------------------------ badges

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}): ReactNode {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em] ${toneSurface[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------- empty

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="mt-4 text-[15px] font-bold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-ink2">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}

// ------------------------------------------------------------------- modal

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}): ReactNode {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${width} card shadow-lift`} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-[12px] text-ink2">{description}</p> : null}
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        {children ? <div className="px-5 py-4 text-[13px] text-ink2">{children}</div> : null}
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ slider

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
  onDragStateChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  onChange: (value: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
  disabled?: boolean;
}): ReactNode {
  const dragging = useRef(false);

  useEffect(() => {
    const end = () => {
      if (!dragging.current) return;
      dragging.current = false;
      onDragStateChange?.(false);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [onDragStateChange]);

  const shown = display ?? String(Math.round(value));

  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-semibold text-ink2">{label}</span>
        <span className={`tabular-nums text-[12px] font-semibold ${value === 0 ? 'text-ink3' : 'text-ink'}`}>
          {shown}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        onPointerDown={() => {
          if (disabled) return;
          dragging.current = true;
          onDragStateChange?.(true);
        }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

// ------------------------------------------------------------------- tabs

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: string; label: string; icon?: IconName }>;
  value: string;
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-alt p-1">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
              active ? 'bg-card text-ink shadow-soft' : 'text-ink2 hover:text-ink'
            }`}
          >
            {tab.icon ? <Icon name={tab.icon} size={15} /> : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------- selection

export function SelectionBar({
  count,
  detail,
  onClear,
  children,
}: {
  count: number;
  detail?: string;
  onClear: () => void;
  children: ReactNode;
}): ReactNode {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-3 rounded-2xl border border-line bg-card/95 px-3 py-2.5 shadow-lift backdrop-blur">
        <button
          type="button"
          onClick={onClear}
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-ink2 hover:bg-alt"
          aria-label="Clear selection"
        >
          <Icon name="x" size={16} />
        </button>
        <div className="pr-1">
          <p className="text-[12.5px] font-bold leading-tight text-ink">{count} selected</p>
          {detail ? <p className="text-[11px] leading-tight text-ink2">{detail}</p> : null}
        </div>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- photo

export function PhotoTile({
  photo,
  selected,
  onToggle,
  onOpen,
  onView,
  badge,
  caption,
  mode = 'select',
}: {
  photo: Photo;
  selected: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  onView?: () => void;
  badge?: ReactNode;
  caption?: ReactNode;
  /** 'open' tiles are an entry point, so they hide the selection affordance. */
  mode?: 'select' | 'open';
}): ReactNode {
  const primaryLabel =
    mode === 'open' ? `Open ${photo.name} in the editor` : `Select ${photo.name}`;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-alt transition ${
        selected ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-brand/40'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="focus-ring block w-full text-left"
        aria-pressed={mode === 'select' ? selected : undefined}
        aria-label={primaryLabel}
      >
        <div className="relative aspect-square overflow-hidden">
          <img
            src={photo.thumbUrl}
            alt={photo.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
          {mode === 'select' ? (
            <div
              className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border text-white transition ${
                selected
                  ? 'border-brand bg-brand'
                  : 'border-white/70 bg-black/35 opacity-0 backdrop-blur group-hover:opacity-100'
              }`}
            >
              {selected ? <Icon name="check" size={13} /> : null}
            </div>
          ) : null}
          {badge ? <div className="absolute right-2 top-2">{badge}</div> : null}
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-semibold text-ink" title={photo.relPath}>
            {photo.name}
          </p>
          <p className="text-[10.5px] text-ink3">
            {caption ?? formatBytes(photo.sizeBytes)}
          </p>
        </div>
        {onView ? (
          <IconButton
            icon="search"
            label={`View ${photo.name} full size`}
            onClick={onView}
            className="h-7 w-7 shrink-0"
          />
        ) : null}
        {onOpen ? (
          <IconButton icon="sparkles" label={`Enhance ${photo.name}`} onClick={onOpen} className="h-7 w-7 shrink-0" />
        ) : null}
      </div>
    </div>
  );
}
