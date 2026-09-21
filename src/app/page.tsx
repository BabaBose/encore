/**
 * Discovery home.
 *
 * Venues browse the way listeners find artists: featured acts, then rows by
 * moment and by category. Every card carries its rate and city, so nothing
 * needs an inquiry to find out what it costs.
 */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { startingFromHourly, startingFromMonthly } from '@/domain/rates';
import { isDateFree } from '@/domain/availability';
import { today } from '@/domain/dates';
import { pageContext } from '@/lib/page-data';
import { Shell } from '@/components/shell';
import { ActCard, Art, Chip, SectionHead, Stars, accentStyle } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { CurrencyNote, Price } from '@/components/money';
import { HeroImage } from '@/components/hero-image';
import { HowItWorks } from '@/components/how-it-works';
import type { EntertainerDetail } from '@/db/repo';

export const dynamic = 'force-dynamic';

function cardProps(e: EntertainerDetail, opts: { badge?: string | null; longTerm?: boolean } = {}) {
  const monthly = startingFromMonthly(e.rateCard);
  const useMonthly = opts.longTerm && monthly != null;
  return {
    slug: e.slug,
    name: e.stageName,
    accent: e.heroAccent,
    photo: e.photo,
    categoryLabel: e.categoryLabel,
    genreLabels: e.genreLabels,
    cityName: e.homeCity.name,
    priceFrom: useMonthly ? monthly : startingFromHourly(e.rateCard),
    priceUnit: (useMonthly ? 'month' : 'hour') as 'month' | 'hour',
    currency: e.rateCard.currency,
    rating: e.rating,
    reviewCount: e.reviewCount,
    verified: e.verified,
    badge: opts.badge ?? null,
  };
}

/** The next 31 December — the date the designs build their NYE row around. */
function nextNye(from: string): string {
  const year = Number(from.slice(0, 4));
  const candidate = `${year}-12-31`;
  return candidate >= from ? candidate : `${year + 1}-12-31`;
}

export default async function HomePage() {
  const { user, badges, money } = await pageContext();
  const db = getDb();
  const acts = await repo.liveEntertainers(db);
  const now = today();
  const nye = nextNye(now);

  const categories = await repo.topCategories(db);
  const genresPerCategory = await Promise.all(categories.map((c) => repo.genresFor(db, c.id)));

  const featured = acts.filter((a) => a.featured).slice(0, 3);
  const hero = featured[0] ?? acts[0];
  const residencies = acts.filter((a) => a.acceptsLongTerm).slice(0, 8);
  const nyeFree = acts.filter((a) => a.acceptsShortTerm && isDateFree(a.blocks, nye)).slice(0, 8);
  const pianists = acts.filter((a) => a.genres.includes('piano') || a.category === 'instrumentalist').slice(0, 8);

  return (
    <Shell user={user} current="/" badges={badges} money={money}>
      <div className="page">
        {/*
          Test visitors could not tell what this site was. The tagline is a
          mood, not an explanation, so it now sits under a line that names the
          thing outright — a marketplace, for whom, for what — and above one
          sentence per side. Two buttons follow, because the fastest way to
          explain a two-sided marketplace is to let someone say which side they
          are on.
        */}
        <div style={{ marginBottom: 20 }}>
          <HeroImage>
            <div className="hero-eyebrow">The marketplace for live entertainment</div>
            <h1 className="hero-title">
              {/* The accent lands on the second half, as in the brand design. */}
              Great nights start with <em>great acts.</em>
            </h1>
            <p className="hero-lede">
              Restaurants, hotels and bars book live acts here - singers, bands, DJs, magicians - seeing who is
              free on the night and what they charge before sending a message. Artists and their agents list
              once, and get found.
            </p>
            <div className="hero-actions">
              <Link className="btn btn--primary" href="/search">
                Find an act for my venue
              </Link>
              <Link className="btn" href="/signup">
                List my act
              </Link>
            </div>
          </HeroImage>
        </div>

        <section className="sides" aria-label="Who Book the Act is for">
          {/* The same two colours the How it works columns use, so the venue
              half and the artist half stay the same colour down the page. The
              tokens, not their hexes: the light theme darkens both, and a
              dark-theme blue on warm paper is barely there. */}
          <Link href="/search" className="sides__card" style={{ ['--accent' as string]: 'var(--blue)' }}>
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>
              If you run a venue
            </div>
            <h2 className="sides__title">Find someone for the night you actually have</h2>
            <p className="sides__body">
              Search by date, city and what kind of act you want. Every profile shows a live calendar and a
              published rate, so you know who is free and what it costs before you speak to anyone.
            </p>
            <span className="sides__go">Browse acts →</span>
          </Link>

          <Link href="/signup" className="sides__card" style={{ ['--accent' as string]: 'var(--pink)' }}>
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>
              If you perform, or represent someone who does
            </div>
            <h2 className="sides__title">Be found by the rooms that book you</h2>
            <p className="sides__body">
              One profile carries your reel, your rates and your calendar. Venues come to you with a date already
              in mind, nothing is ever booked without you saying yes, and no commission comes out of your fee.
            </p>
            <span className="sides__go">List your act →</span>
          </Link>
        </section>

        {hero ? (
          <Link href={`/entertainers/${hero.slug}`} style={{ display: 'block', marginBottom: 34 }}>
            <Art
              accent={hero.heroAccent}
              photo={hero.photo}
              alt={hero.stageName}
              className="hero"
              style={{ minHeight: 210 }}
            >
              <span className="pill pill--accent" style={{ alignSelf: 'flex-start' }}>
                Featured this week
              </span>
              <h2 className="display" style={{ fontSize: 30 }}>
                {hero.stageName}
              </h2>
              <p className="lede" style={{ maxWidth: '52ch' }}>
                {hero.shortBio}
              </p>
              <div className="row" style={{ marginTop: 6 }}>
                <Chip mono>{hero.categoryLabel}</Chip>
                <Chip>{hero.homeCity.name}</Chip>
                <Chip accent>
                  from <Price minor={startingFromHourly(hero.rateCard)} currency={hero.rateCard.currency} suffix="/hr" short />
                </Chip>
                <Stars rating={hero.rating} count={hero.reviewCount} />
              </div>
            </Art>
          </Link>
        ) : null}

        <section style={{ marginBottom: 34 }}>
          <SectionHead
            title="Free on New Year’s Eve"
            note={formatDate(nye)}
            action={
              <Link className="btn btn--sm" href={`/search?gigType=one_time&date=${nye}`}>
                See all
              </Link>
            }
          />
          <div className="carousel">
            {nyeFree.map((a) => (
              <ActCard key={a.id} {...cardProps(a)} />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 34 }}>
          <SectionHead
            title="Open to a residency"
            note="1-12 month contracts"
            action={
              <Link className="btn btn--sm" href="/search?gigType=long_term&months=6">
                See all
              </Link>
            }
          />
          <div className="carousel">
            {residencies.map((a) => (
              <ActCard
                key={a.id}
                {...cardProps(a, { longTerm: true, badge: a.openToRelocate ? 'Will relocate' : null })}
              />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 34 }}>
          <SectionHead title="Piano and strings" note="Lobby, brunch and dinner service" />
          <div className="carousel">
            {pianists.map((a) => (
              <ActCard key={a.id} {...cardProps(a)} />
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 40 }}>
          <SectionHead title="Browse by category" />
          <div className="grid grid--cards">
            {categories.map((cat, i) => {
              const count = acts.filter((a) => a.category === cat.slug).length;
              return (
                <Link
                  key={cat.id}
                  href={`/search?category=${cat.slug}`}
                  className="card"
                  style={{ ...accentStyle(cat.accent ?? 'var(--pink)'), display: 'block' }}
                >
                  <div className="spread">
                    <span className="subtitle">{cat.label}</span>
                    <span className="mono dim" style={{ fontSize: 11.5 }}>
                      {count}
                    </span>
                  </div>
                  <div className="row row--tight" style={{ marginTop: 10 }}>
                    {genresPerCategory[i].slice(0, 3).map((g) => (
                      <Chip key={g.id}>{g.label}</Chip>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <HowItWorks />

        <CurrencyNote style={{ marginTop: 28 }} />
      </div>
    </Shell>
  );
}
