/**
 * The Book the Act mark and lockups.
 *
 * The mark is a three-by-three grid with the centre cell lit in the accent —
 * the act in the middle of the room. Its proportions are taken from the brand
 * design and scale from the ratios below, so a 24px header mark and a 72px app
 * tile are the same drawing rather than two hand-tuned ones.
 *
 * Every dimension is a `calc()` off the `--logo` custom property rather than a
 * number baked into the markup, so a media query can resize the whole lockup —
 * mark, wordmark, gaps and all — without the component knowing about it.
 */
import type { CSSProperties } from 'react';
import { BRAND_NAME, TAGLINE_EYEBROW } from '@/lib/brand';

/** Ratios measured off the 58px primary lockup in the brand design. */
const RATIO = {
  radius: 0.224,
  padding: 0.121,
  gap: 0.06,
  cellRadius: 0.035,
  border: 0.043,
} as const;

export interface MarkProps {
  /** A px number, or any CSS length — including one that reads `--logo`. */
  size?: number | string;
  /**
   * `outline` is the everyday mark — a hairline frame with dim cells. `filled`
   * is the app-tile variant: a solid accent tile with the cells knocked out of
   * it, for a favicon or a home-screen icon.
   */
  variant?: 'outline' | 'filled';
  className?: string;
}

export function Mark({ size = 28, variant = 'outline', className }: MarkProps) {
  const filled = variant === 'filled';
  const mark = typeof size === 'number' ? `${size}px` : size;
  const u = (ratio: number, min = 0) =>
    min ? `max(${min}px, calc(var(--mark) * ${ratio}))` : `calc(var(--mark) * ${ratio})`;

  return (
    <span
      className={className}
      aria-hidden="true"
      style={
        {
          '--mark': mark,
          width: 'var(--mark)',
          height: 'var(--mark)',
          flex: 'none',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: u(RATIO.gap),
          padding: filled ? u(RATIO.padding * 1.1) : u(RATIO.padding),
          borderRadius: u(RATIO.radius),
          border: filled ? 'none' : `${u(RATIO.border, 1)} solid var(--mark-frame)`,
          background: filled ? 'var(--accent)' : 'transparent',
        } as CSSProperties
      }
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          style={{
            display: 'block',
            borderRadius: u(RATIO.cellRadius, 1),
            // The centre cell is the act; the other eight are the room.
            background:
              i === 4
                ? filled
                  ? 'var(--mark-knockout)'
                  : 'var(--accent)'
                : filled
                  ? 'var(--mark-knockout-dim)'
                  : 'var(--mark-cell)',
          }}
        />
      ))}
    </span>
  );
}

export interface LogoProps {
  /**
   * Wordmark size — a px number, or any CSS length. The mark, gaps and tagline
   * all scale from it. Leave it out to let CSS set `--logo` instead, which is
   * how the header resizes the lockup per breakpoint.
   */
  size?: number | string;
  /**
   * The tagline is dropped below a 140px wordmark, per the brand design — it
   * stops being legible before it stops fitting.
   */
  tagline?: boolean;
  layout?: 'horizontal' | 'stacked';
  className?: string;
  style?: CSSProperties;
}

export function Logo({ size, tagline = false, layout = 'horizontal', className, style }: LogoProps) {
  const stacked = layout === 'stacked';
  // Setting `--logo` inline would beat any stylesheet, so it is only set when a
  // caller asked for a specific size. Otherwise the fallback in each calc wins.
  const own = size === undefined ? null : typeof size === 'number' ? `${size}px` : size;
  const L = 'var(--logo, 22px)';
  const showTagline = tagline && (typeof size !== 'number' || size >= 14);

  return (
    <span
      className={className}
      style={
        {
          ...(own ? { '--logo': own } : null),
          display: 'inline-flex',
          flexDirection: stacked ? 'column' : 'row',
          alignItems: 'center',
          gap: `calc(${L} * ${stacked ? 0.6 : 0.55})`,
          textAlign: stacked ? 'center' : 'left',
          ...style,
        } as CSSProperties
      }
    >
      {/* The mark sits a little larger than the cap height, as in the lockups.
          Passed as a calc so it follows `--logo` wherever that gets overridden. */}
      <Mark size={`calc(${L} * 1.7)`} />
      <span style={{ display: 'block' }}>
        <span
          style={{
            display: 'block',
            font: `800 ${L}/1 var(--font-sans)`,
            letterSpacing: '-0.05em',
            color: 'var(--ink)',
            whiteSpace: 'nowrap',
          }}
        >
          {BRAND_NAME}
        </span>
        {showTagline ? (
          <span
            style={{
              display: 'block',
              marginTop: `calc(${L} * 0.3)`,
              font: `500 max(9px, calc(${L} * 0.31)) var(--font-mono)`,
              letterSpacing: '0.17em',
              textTransform: 'uppercase',
              color: 'var(--ink-dim)',
            }}
          >
            {TAGLINE_EYEBROW}
          </span>
        ) : null}
      </span>
    </span>
  );
}
