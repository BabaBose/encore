/**
 * Brand constants.
 *
 * One place for the name and tagline, so a rename is a single edit rather than
 * a hunt through copy. Everything here comes from the brand design.
 */

export const BRAND_NAME = 'Book the Act';

/** Set as a sentence, for headlines and marketing surfaces. */
export const TAGLINE = 'Great nights start with great acts.';

/**
 * The same line as a lockup eyebrow: letter-spaced monospace caps, no full
 * stop. Kept apart from `TAGLINE` because the two are not interchangeable —
 * uppercasing the sentence in CSS would leave the stop behind.
 */
export const TAGLINE_EYEBROW = 'Great nights start with great acts';

export const DOMAIN = 'booktheact.com';

export const DESCRIPTION =
  'A two-sided marketplace connecting restaurants and hotels with entertainers: searchable profiles, live availability and published rates.';

/**
 * The landing-page hero image.
 *
 * A real photograph lives in `public/`; this is its path, its intrinsic size
 * (so the browser reserves the space before it loads) and the crop anchor used
 * when the container is wider than 3:2. Set `src` to null to fall back to the
 * illustrated supper-club scene drawn in `HeroImage`.
 */
export const HERO_IMAGE: {
  src: string | null;
  width: number;
  height: number;
  /** Vertical crop anchor — the club sign sits high, so bias up to keep it whole. */
  position: string;
  alt: string;
} = {
  src: '/hero-supper-club.webp',
  width: 1536,
  height: 1024,
  position: 'center 18%',
  alt: 'A singer in a red gown at the mic with a jazz quartet behind her, playing to candlelit tables in a supper club',
};
