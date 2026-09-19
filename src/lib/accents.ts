/**
 * Accent theming.
 *
 * Each act is stored with one of the brand accents as a dark-canvas hex. Each
 * theme has its own palette — the bright values drop to roughly 2.5:1 on warm
 * paper, which fails for the small text that carries them — so a stored colour
 * resolves to a CSS token rather than to a literal. Swapping theme then swaps
 * every act's tint with it.
 */
import type { CSSProperties } from 'react';

const ACCENT_TOKENS: Record<string, string> = {
  '#ff5fa2': 'var(--pink)',
  '#ffb43a': 'var(--amber)',
  '#3ddc84': 'var(--green)',
  '#a97bff': 'var(--violet)',
  '#ff7a59': 'var(--coral)',
  '#5fb0ff': 'var(--blue)',
};

/** Anything not in the palette is passed through, so a custom colour still works. */
export function resolveAccent(accent: string): string {
  return ACCENT_TOKENS[accent.toLowerCase()] ?? accent;
}

/** Every act tints its own surfaces from its accent. */
export function accentStyle(accent: string): CSSProperties {
  return { ['--accent' as string]: resolveAccent(accent) };
}
