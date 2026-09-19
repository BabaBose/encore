/**
 * The Book the Act mark and lockups.
 *
 * The mark is a three-by-three grid with the centre cell lit in the accent —
 * the act in the middle of the room. Its proportions are taken from the brand
 * design and scale from the ratios below, so a 24px rail mark and a 72px app
 * tile are the same drawing rather than two hand-tuned ones.
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
  size?: number;
  /**
   * `outline` is the everyday mark — a hairline frame with dim cells. `filled`
   * is the app-tile variant: a solid accent tile with the cells knocked out of
   * it, for a favicon or a home-screen icon.
   */
  variant?: 'outline' | 'filled';
  className?: string;
}

export function Mark({ size = 28, variant = 'outline', className }: MarkProps) {
  const padding = size * RATIO.padding;
  const gap = size * RATIO.gap;
  const border = Math.max(1, size * RATIO.border);
  const cellRadius = Math.max(1, size * RATIO.cellRadius);

  const filled = variant === 'filled';

  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        gap,
        padding: filled ? padding * 1.1 : padding,
        borderRadius: size * RATIO.radius,
        border: filled ? 'none' : `${border}px solid var(--mark-frame)`,
        background: filled ? 'var(--accent)' : 'transparent',
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          style={{
            display: 'block',
            borderRadius: cellRadius,
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
  /** Wordmark size in px. The mark and tagline scale from it. */
  size?: number;
  /**
   * The tagline is dropped below a 140px wordmark, per the brand design — it
   * stops being legible before it stops fitting.
   */
  tagline?: boolean;
  layout?: 'horizontal' | 'stacked';
  className?: string;
  style?: CSSProperties;
}

export function Logo({ size = 22, tagline = false, layout = 'horizontal', className, style }: LogoProps) {
  const stacked = layout === 'stacked';
  // The mark sits a little larger than the cap height, as in the lockups.
  const markSize = Math.round(size * 1.7);
  const showTagline = tagline && size >= 14;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: stacked ? 'column' : 'row',
        alignItems: 'center',
        gap: stacked ? size * 0.6 : size * 0.55,
        textAlign: stacked ? 'center' : 'left',
        ...style,
      }}
    >
      <Mark size={markSize} />
      <span style={{ display: 'block' }}>
        <span
          style={{
            display: 'block',
            font: `800 ${size}px/1 var(--font-sans)`,
            letterSpacing: '-0.05em',
            color: 'var(--ink)',
          }}
        >
          {BRAND_NAME}
        </span>
        {showTagline ? (
          <span
            style={{
              display: 'block',
              marginTop: size * 0.3,
              font: `500 ${Math.max(9, size * 0.31)}px var(--font-mono)`,
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
