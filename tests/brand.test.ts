import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BRAND_NAME, TAGLINE, TAGLINE_EYEBROW } from '@/lib/brand';
import { resolveAccent } from '@/lib/accents';

const css = readFileSync('src/app/globals.css', 'utf8');

/** Every accent the seed gives an act, as stored on `cover_accent`. */
const STORED_ACCENTS = ['#ff5fa2', '#ffb43a', '#3ddc84', '#a97bff', '#ff7a59', '#5fb0ff'];

describe('brand constants', () => {
  it('keeps the eyebrow and the sentence in step', () => {
    // Uppercasing the sentence in CSS would leave the full stop behind, which
    // is why these are two constants rather than one.
    expect(TAGLINE).toBe(`${TAGLINE_EYEBROW}.`);
    expect(BRAND_NAME).toBe('Book the Act');
  });
});

describe('accent theming', () => {
  it('resolves every stored accent to a token, never a literal', () => {
    for (const accent of STORED_ACCENTS) {
      // A literal would freeze the act's tint at the dark-theme value and go
      // unreadable on the light canvas.
      expect(resolveAccent(accent)).toMatch(/^var\(--[a-z]+\)$/);
    }
  });

  it('is case-insensitive about how a colour was stored', () => {
    expect(resolveAccent('#FF5FA2')).toBe('var(--pink)');
  });

  it('passes an unknown colour through unchanged', () => {
    expect(resolveAccent('#123456')).toBe('#123456');
  });

  it('defines every one of those tokens in both themes', () => {
    const light = css.slice(css.indexOf("[data-theme='light']"));
    for (const accent of STORED_ACCENTS) {
      const token = resolveAccent(accent).replace('var(', '').replace(')', '');
      expect(css, `${token} missing from the dark theme`).toContain(`${token}:`);
      expect(light, `${token} missing from the light theme`).toContain(`${token}:`);
    }
  });

  it('gives the light theme its own, darker values', () => {
    // The dark palette is built for a near-black canvas and is unreadable on
    // warm paper, so the two must not be the same hexes.
    const light = css.slice(css.indexOf("[data-theme='light']"));
    for (const accent of STORED_ACCENTS) {
      expect(light).not.toContain(accent);
    }
  });
});
