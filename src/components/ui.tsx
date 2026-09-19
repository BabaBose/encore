/**
 * Presentational building blocks shared across the app. All server-renderable:
 * nothing here holds state.
 */
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { STATUS_LABEL, STATUS_TONE } from '@/domain/inquiry';
import type { InquiryStatus } from '@/domain/types';
import { formatMoneyShort } from '@/lib/format';
import { MATCH_REASON_LABEL, type MatchReason } from '@/domain/search';
import { accentStyle, resolveAccent } from '@/lib/accents';

// Re-exported so component callers keep importing their styling helpers from
// one place.
export { accentStyle, resolveAccent };

export function Art({
  accent,
  photo,
  alt = '',
  className = '',
  style,
  children,
}: {
  accent: string;
  /** A profile photograph. Without one the accent wash below is the artwork. */
  photo?: string | null;
  /** Left empty on a card: the act's name is already its link text. */
  alt?: string;
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <div className={`art ${className}`} style={{ ...accentStyle(accent), ...style }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- sized by CSS, not by the layout
        <img className="art__photo" src={photo} alt={alt} loading="lazy" decoding="async" />
      ) : null}
      {children}
    </div>
  );
}

export function StatusPill({ status }: { status: InquiryStatus }) {
  return <span className={`pill pill--${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Chip({
  children,
  accent = false,
  mono = false,
}: {
  children: React.ReactNode;
  accent?: boolean;
  mono?: boolean;
}) {
  return <span className={`chip${accent ? ' chip--accent' : ''}${mono ? ' chip--mono' : ''}`}>{children}</span>;
}

export function Stars({ rating, count }: { rating: number | null; count: number }) {
  if (rating == null) {
    return <span className="dim mono" style={{ fontSize: 11.5 }}>No reviews yet</span>;
  }
  return (
    <span className="mono" style={{ fontSize: 11.5 }}>
      ★ {rating.toFixed(1)} <span className="dim">({count})</span>
    </span>
  );
}

export interface ActCardProps {
  slug: string;
  name: string;
  accent: string;
  photo?: string | null;
  categoryLabel: string;
  genreLabels: string[];
  cityName: string;
  priceFrom: number;
  priceUnit: 'hour' | 'month';
  currency: string;
  rating: number | null;
  reviewCount: number;
  verified?: boolean;
  badge?: string | null;
  reason?: MatchReason | null;
  /** Shown beside the price when it was resolved for a specific date. */
  priceNote?: string | null;
  /**
   * For a residency search: how much of the window is already committed. Shown
   * so an act who stays visible while busy is never mistaken for a clear one.
   */
  windowNote?: string | null;
}

export function ActCard(props: ActCardProps) {
  const unit = props.priceUnit === 'month' ? '/mo' : '/hr';
  return (
    <Link href={`/entertainers/${props.slug}`} className="act-card" style={accentStyle(props.accent)}>
      <Art accent={props.accent} photo={props.photo} className="act-card__art">
        {props.badge ? <span className="pill pill--accent">{props.badge}</span> : <span />}
        {props.verified ? (
          <span className="pill pill--positive" title="Identity verified by Book the Act">
            ✓
          </span>
        ) : null}
      </Art>
      <div className="act-card__body">
        <div className="act-card__name">{props.name}</div>
        <div className="act-card__meta">
          {[props.categoryLabel, ...props.genreLabels.slice(0, 1)].join(' · ')} · {props.cityName}
        </div>
        <div className="spread">
          <span className="act-card__rate">
            {props.priceNote ? '' : 'from '}
            {formatMoneyShort(props.priceFrom, props.currency)}
            {unit}
            {props.priceNote ? <span className="dim"> {props.priceNote}</span> : null}
          </span>
          <Stars rating={props.rating} count={props.reviewCount} />
        </div>
        {props.reason && props.reason !== 'based_in_city' ? (
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>
            {MATCH_REASON_LABEL[props.reason]}
          </span>
        ) : null}
        {props.windowNote ? (
          <span className="eyebrow" style={{ color: 'var(--amber)' }}>
            {props.windowNote}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok'; children: React.ReactNode }) {
  const cls = kind === 'error' ? 'notice notice--error' : kind === 'ok' ? 'notice notice--ok' : 'notice';
  return <div className={cls}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function SectionHead({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-head spread">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h2 className="subtitle">{title}</h2>
        {note ? <span className="dim" style={{ fontSize: 12.5 }}>{note}</span> : null}
      </div>
      {action}
    </div>
  );
}
