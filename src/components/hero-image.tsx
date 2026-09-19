/**
 * The landing-page hero: a late set in a supper club, with the tagline on it.
 *
 * `HERO_IMAGE.src` in `src/lib/brand.ts` points at the photograph in `public/`.
 * Whatever is passed as children is laid over the bottom-left of the frame, on
 * a scrim heavy enough to carry small text over a busy photo. That text is
 * always over a dark image, so it sets its own light-on-dark colours rather
 * than inheriting the theme's.
 *
 * With no photograph this draws the scene below instead, so the page reads as
 * finished rather than as a hole where an image should be. The drawing is
 * deliberately stylised: a flat illustration that commits to being one looks
 * composed, a half-hearted run at photorealism looks broken.
 */
import { HERO_IMAGE } from '@/lib/brand';

export function HeroImage({ children }: { children?: React.ReactNode }) {
  const photo = HERO_IMAGE.src;
  return (
    <div className="hero-frame">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- one static hero, sized by CSS
        <img
          src={photo}
          alt={HERO_IMAGE.alt}
          width={HERO_IMAGE.width}
          height={HERO_IMAGE.height}
          fetchPriority="high"
          decoding="async"
          style={{ objectPosition: HERO_IMAGE.position }}
        />
      ) : (
        <SupperClubScene />
      )}

      <div className="hero-scrim" />

      {children ? <div className="hero-overlay">{children}</div> : null}
    </div>
  );
}

/**
 * A supper club at the late set: a deco arch and curtain behind, a singer in
 * the spotlight, piano and double bass either side in deeper shadow, candlelit
 * tables softened in the foreground.
 *
 * Composed as a poster rather than a photograph — flat silhouettes, a single
 * warm key light, everything reading in one glance at any size.
 */
function SupperClubScene() {
  return (
    <svg
      viewBox="0 0 1600 700"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Illustration of a trio playing a late set in a supper club"
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        <linearGradient id="bta-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#30141e" />
          <stop offset="52%" stopColor="#1a0b12" />
          <stop offset="100%" stopColor="#0a0508" />
        </linearGradient>
        <linearGradient id="bta-curtain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6d2436" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#2a0e18" stopOpacity="0.9" />
        </linearGradient>
        <radialGradient id="bta-key" cx="50%" cy="22%" r="58%">
          <stop offset="0%" stopColor="#ffca7a" stopOpacity="0.62" />
          <stop offset="48%" stopColor="#ff8f4d" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#ff5fa2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bta-beam" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffe0b0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffe0b0" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="bta-pool" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd79a" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#ffd79a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bta-candle" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd089" stopOpacity="0.85" />
          <stop offset="40%" stopColor="#ff9d3d" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#ff9d3d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bta-bokeh" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffc98a" stopOpacity="0.44" />
          <stop offset="100%" stopColor="#ffc98a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bta-vignette" cx="50%" cy="44%" r="74%">
          <stop offset="52%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.68" />
        </radialGradient>
        {/* The arch doubles as a clip, so the curtain folds stop at its edge. */}
        <clipPath id="bta-arch">
          <path d="M498 520 L498 300 A302 302 0 0 1 1102 300 L1102 520 Z" />
        </clipPath>
      </defs>

      <rect width="1600" height="700" fill="url(#bta-room)" />
      <rect width="1600" height="700" fill="url(#bta-key)" />

      {/* Deco arch with curtain folds behind the stage. */}
      <g clipPath="url(#bta-arch)">
        <rect x="490" y="0" width="620" height="540" fill="url(#bta-curtain)" />
        {Array.from({ length: 13 }, (_, i) => (
          <rect key={i} x={498 + i * 47} y="0" width="22" height="540" fill="#12060b" opacity="0.32" />
        ))}
      </g>
      <path
        d="M498 520 L498 300 A302 302 0 0 1 1102 300 L1102 520"
        fill="none"
        stroke="#ffb46a"
        strokeOpacity="0.28"
        strokeWidth="3"
      />

      {/* Key light: a cone from above and its pool on the boards. */}
      <path d="M742 0 L648 520 L952 520 L858 0 Z" fill="url(#bta-beam)" />
      <ellipse cx="800" cy="524" rx="230" ry="42" fill="url(#bta-pool)" />

      {[
        [188, 132, 30],
        [352, 92, 20],
        [1262, 110, 28],
        [1436, 158, 22],
        [1090, 62, 15],
        [96, 268, 24],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="url(#bta-bokeh)" />
      ))}

      {/* Stage floor. */}
      <rect x="0" y="520" width="1600" height="180" fill="#0c0609" />
      <rect x="0" y="518" width="1600" height="3" fill="#ffb46a" opacity="0.22" />

      {/* Grand piano and player, stage left, held back in shadow. */}
      <g fill="#050203" opacity="0.92">
        <path d="M296 520 L296 470 C296 452 316 440 352 436 L520 420 C556 417 566 430 552 444 L470 520 Z" />
        <rect x="300" y="432" width="196" height="9" rx="4" opacity="0.5" />
        <circle cx="392" cy="392" r="17" />
        <path d="M362 436 C362 410 375 398 392 398 C409 398 422 410 422 436 Z" />
      </g>

      {/* Double bass and player, stage right. */}
      <g fill="#050203" opacity="0.92">
        <path d="M1196 520 C1150 520 1128 480 1136 438 C1144 396 1182 380 1206 398 C1234 419 1236 476 1216 504 C1210 514 1203 520 1196 520 Z" />
        <rect x="1194" y="286" width="13" height="120" rx="6" transform="rotate(-8 1200 346)" />
        <path d="M1176 290 C1169 276 1186 268 1195 280" fill="none" stroke="#050203" strokeWidth="10" strokeLinecap="round" />
        <circle cx="1272" cy="352" r="18" />
        <path d="M1240 520 C1240 424 1254 392 1272 392 C1291 392 1304 424 1304 520 Z" />
        <path d="M1252 404 L1212 386 L1206 400 L1246 420 Z" />
      </g>

      {/* The singer, front and centre in the light. */}
      <g fill="#040102">
        <circle cx="800" cy="292" r="19" />
        <path d="M791 308 L809 308 L812 322 L788 322 Z" />
        <path d="M766 520 C766 392 780 320 800 320 C820 320 834 392 834 520 Z" />
        {/* Raised arm, hand near the mic. */}
        <path d="M776 336 C760 330 746 318 741 306 L753 298 C758 308 770 318 782 324 Z" />
        <rect x="726" y="300" width="7" height="220" rx="3" />
        <ellipse cx="729" cy="294" rx="11" ry="15" />
      </g>

      {/* Foreground tables, soft and out of focus. */}
      {[
        [170, 608, 104],
        [560, 648, 120],
        [1120, 640, 116],
        [1470, 600, 100],
      ].map(([cx, cy, r], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy - 26} r={r * 1.35} fill="url(#bta-candle)" opacity="0.55" />
          <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.24} fill="#090406" opacity="0.94" />
          <rect x={cx - 4} y={cy - 26} width="9" height="26" rx="4" fill="#180c11" />
          <circle cx={cx + 0.5} cy={cy - 31} r="7" fill="#ffd89a" opacity="0.92" />
        </g>
      ))}

      <rect width="1600" height="700" fill="url(#bta-vignette)" />
    </svg>
  );
}
