/**
 * Entertainer profile — the detail view behind every search card.
 *
 * Everything a venue needs to decide is on this one page: the reel, the bio,
 * the live calendar, the full rate table, verified reviews kept visibly apart
 * from self-submitted references, and a booking panel docked alongside it.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { isDiscoverable } from '@/domain/profile';
import { today } from '@/domain/dates';
import { startingFromHourly, startingFromMonthly } from '@/domain/rates';
import { pageContext } from '@/lib/page-data';
import { Shell } from '@/components/shell';
import { Art, Chip, Empty, SectionHead, Stars, accentStyle } from '@/components/ui';
import { AvailabilityGrid, CalendarLegend } from '@/components/calendar';
import { RateGrid, RateSummary } from '@/components/rate-table';
import { InquiryPanel } from '@/components/inquiry-panel';
import { ShortlistButton } from '@/components/shortlist-button';
import { formatDate } from '@/lib/format';
import { CurrencyNote, Price } from '@/components/money';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, badges, money } = await pageContext();

  const db = getDb();
  const act = await repo.getEntertainerBySlug(db, slug);
  if (!act) notFound();

  const viewerOwnsIt = user?.id === act.userId || user?.id === act.managedByUserId;
  const viewerIsAdmin = user?.role === 'admin';
  // A profile that is not live is visible only to its owner and to admin.
  if (!isDiscoverable(act.status) && !viewerOwnsIt && !viewerIsAdmin) notFound();

  const videos = await repo.listPublicMedia(db, act.id, 'video');
  const photos = await repo.listPublicMedia(db, act.id, 'photo');
  const awards = await repo.listAwards(db, act.id);
  const references = await repo.listReferences(db, act.id);
  const reviews = await repo.listReviews(db, act.id);
  const cities = await repo.listCities(db);

  const now = today();
  const [y, m] = now.split('-').map(Number);
  const focusDate = typeof sp.date === 'string' ? sp.date : null;
  const specialDates = act.rateCard.specialDates.map((s) => s.date);

  // The calendar shows three months from now, or from the searched date.
  const anchorMonth = focusDate ? Number(focusDate.slice(5, 7)) : m;
  const anchorYear = focusDate ? Number(focusDate.slice(0, 4)) : y;
  const months = [0, 1, 2].map((offset) => {
    const total = anchorMonth - 1 + offset;
    return { year: anchorYear + Math.floor(total / 12), month: (total % 12) + 1 };
  });

  const viewerVenue = user?.role === 'venue' ? await repo.getVenueForUser(db, user.id) : null;
  const shortlists = viewerVenue ? await repo.listShortlists(db, viewerVenue.id) : [];

  return (
    <Shell user={user} current="/search" badges={badges} money={money}>
      <div className="page" style={accentStyle(act.heroAccent)}>
        {!isDiscoverable(act.status) ? (
          <div className="notice" style={{ marginBottom: 18 }}>
            This profile is <strong>{act.status.replace('_', ' ')}</strong> — only you and Book the Act can see it.
            {act.reviewNote ? <> Our note: “{act.reviewNote}”</> : null}
          </div>
        ) : null}

        <div className="split">
          <div className="stack" style={{ gap: 28 }}>
            <Art
              accent={act.heroAccent}
              photo={act.photo}
              alt={act.stageName}
              className="hero"
              style={{ minHeight: 260 }}
            >
              <div className="row row--tight">
                {act.featured ? <span className="pill pill--accent">Featured</span> : null}
                {act.verified ? <span className="pill pill--positive">Verified</span> : null}
                {act.openToRelocate ? <span className="pill pill--neutral">Open to relocation</span> : null}
              </div>
              <h1 className="display">{act.stageName}</h1>
              <p className="lede">{act.shortBio}</p>
              <div className="row">
                <Chip mono>{act.categoryLabel}</Chip>
                {act.genreLabels.slice(0, 3).map((g) => (
                  <Chip key={g}>{g}</Chip>
                ))}
                <Chip>{act.homeCity.name}</Chip>
                <Stars rating={act.rating} count={act.reviewCount} />
              </div>
            </Art>

            {act.managedByUserId ? (
              <div className="notice">
                <strong>Represented act.</strong> {act.representationNote ?? 'This profile is managed by an agency or manager.'}
              </div>
            ) : null}

            <section>
              <SectionHead title="Reel" note={`${videos.length} video${videos.length === 1 ? '' : 's'}`} />
              {videos.length ? (
                <div className="grid grid--wide">
                  {videos.map((v) => (
                    <a key={v.id} href={v.url} target="_blank" rel="noreferrer" className="act-card">
                      <Art accent={v.accent ?? act.heroAccent} className="act-card__art">
                        <span className="pill pill--neutral">▶ Watch</span>
                      </Art>
                      <div className="act-card__body">
                        <div className="act-card__name">{v.title ?? 'Performance reel'}</div>
                        <div className="act-card__meta" style={{ wordBreak: 'break-all' }}>
                          {v.url.replace(/^https?:\/\//, '').slice(0, 44)}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <Empty>No video yet.</Empty>
              )}
            </section>

            {photos.length ? (
              <section>
                <SectionHead title="Gallery" />
                <div className="carousel">
                  {photos.map((p) => (
                    <Art
                      key={p.id}
                      accent={p.accent ?? act.heroAccent}
                      style={{ aspectRatio: '4 / 3', borderRadius: 'var(--radius-lg)', width: 208 }}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <SectionHead title="About" />
              <p className="lede" style={{ marginBottom: 16 }}>
                {act.fullBio}
              </p>
              <dl className="kv">
                <dt>Team</dt>
                <dd>
                  {act.teamSize === 1 ? 'Solo' : act.teamSize === 2 ? 'Duo' : act.teamSize === 3 ? 'Trio' : `${act.teamSize}-piece`}
                </dd>
                <dt>Languages</dt>
                <dd>{act.languages.join(', ') || '—'}</dd>
                <dt>Origin</dt>
                <dd>{act.countryOfOrigin || '—'}</dd>
                <dt>Brings</dt>
                <dd>{act.equipmentProvided || '—'}</dd>
                <dt>Needs</dt>
                <dd>{act.equipmentRequired || '—'}</dd>
                <dt>Travels</dt>
                <dd>
                  {act.travelCityNames.length ? act.travelCityNames.join(', ') : 'Home city only'}
                  {act.travelRadiusKm ? ` · within ${act.travelRadiusKm} km` : ''}
                </dd>
                {act.acceptsLongTerm ? (
                  <>
                    <dt>Residencies</dt>
                    <dd>
                      {act.contractLengths.length
                        ? act.contractLengths.map((m) => `${m} month${m > 1 ? 's' : ''}`).join(' · ')
                        : 'On request'}
                      {act.openToRelocate ? ' · will relocate' : ' · home city only'}
                      {act.residencyInquiryPolicy === 'always'
                        ? ' · takes residency inquiries even with dates booked'
                        : ''}
                    </dd>
                  </>
                ) : null}
              </dl>
            </section>

            <section>
              <SectionHead
                title="Availability"
                note={act.acceptsLongTerm && !act.acceptsShortTerm ? 'Residencies only' : 'Live — updated by the act'}
              />
              {act.acceptsShortTerm ? (
                <>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
                    {months.map((mm) => (
                      <div key={`${mm.year}-${mm.month}`} className="card">
                        <div className="eyebrow" style={{ marginBottom: 10 }}>
                          {new Date(Date.UTC(mm.year, mm.month - 1, 1)).toLocaleDateString('en-GB', {
                            month: 'long',
                            year: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </div>
                        <AvailabilityGrid
                          blocks={act.blocks}
                          year={mm.year}
                          month={mm.month}
                          specialDates={specialDates}
                          focusDate={focusDate}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <CalendarLegend />
                  </div>
                </>
              ) : (
                <div className="card">
                  <p className="muted">
                    This act takes residencies rather than single dates.{' '}
                    {act.contractLengths.length
                      ? `Contracts of ${act.contractLengths.map((m) => `${m} month${m > 1 ? 's' : ''}`).join(', ')}.`
                      : ''}{' '}
                    {act.openToRelocate ? 'Will relocate for the right contract.' : 'Home city only.'}
                  </p>
                </div>
              )}
            </section>

            <section>
              <SectionHead title="Rates" note="Published in advance — nothing is negotiated blind" />
              <div className="card stack" style={{ gap: 18 }}>
                <RateSummary card={act.rateCard} />
                {act.acceptsShortTerm ? (
                  <div className="scroll-x">
                    <RateGrid card={act.rateCard} />
                  </div>
                ) : null}
                {act.rateCard.specialDates.length ? (
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>
                      Special dates — these override the grid
                    </div>
                    <div className="listing">
                      {act.rateCard.specialDates.map((s) => (
                        <div key={s.date} className="listing__item" style={{ paddingLeft: 0, paddingRight: 0 }}>
                          <div className="listing__main">
                            <div className="listing__name">{s.label}</div>
                            <div className="listing__meta">
                              {formatDate(s.date)}
                              {s.minimumHours ? ` · ${s.minimumHours} hr minimum` : ''}
                            </div>
                          </div>
                          <span className="mono" style={{ color: 'var(--amber)' }}>
                            <Price minor={s.hourly} currency={act.rateCard.currency} suffix="/hr" />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section>
              <SectionHead
                title="Verified reviews"
                note="From completed bookings on Book the Act only"
              />
              {reviews.length ? (
                <div className="stack" style={{ gap: 12 }}>
                  {reviews.map((r) => (
                    <div key={r.id} className="card">
                      <div className="spread" style={{ marginBottom: 6 }}>
                        <strong>{r.venueName}</strong>
                        <span className="mono" style={{ fontSize: 12 }}>
                          {'★'.repeat(r.rating)}
                          <span className="dim">{'★'.repeat(5 - r.rating)}</span>
                        </span>
                      </div>
                      <p className="muted">{r.body}</p>
                      {r.gigDate ? <div className="eyebrow" style={{ marginTop: 8 }}>{formatDate(r.gigDate)}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>No verified reviews yet — this act has not completed a booking through Book the Act.</Empty>
              )}
            </section>

            {references.length ? (
              <section>
                <SectionHead
                  title="References"
                  note="Added by the act and checked by Book the Act — not verified bookings"
                />
                <div className="stack" style={{ gap: 12 }}>
                  {references.map((r) => (
                    <div key={r.id} className="card">
                      <p style={{ fontStyle: 'italic' }}>“{r.quote}”</p>
                      <div className="eyebrow" style={{ marginTop: 10 }}>
                        {r.clientName}
                        {r.gigDate ? ` · ${formatDate(r.gigDate)}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {awards.length ? (
              <section>
                <SectionHead title="Awards" />
                <div className="listing card" style={{ padding: 0 }}>
                  {awards.map((a) => (
                    <div key={a.id} className="listing__item">
                      <div className="listing__main">
                        <div className="listing__name">{a.title}</div>
                        <div className="listing__meta">{a.issuer}</div>
                      </div>
                      <span className="mono dim">{a.year}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* The booking panel stays docked beside the profile on desktop. */}
          <aside className="sticky stack" style={{ gap: 16 }}>
            <div className="panel">
              <div className="panel__head spread">
                <div>
                  <div className="eyebrow">From</div>
                  <div className="title" style={{ fontSize: 20 }}>
                    <Price minor={startingFromHourly(act.rateCard)} currency={act.rateCard.currency} short />
                    <span className="dim" style={{ fontSize: 13, fontWeight: 500 }}>
                      {' '}
                      / hour
                    </span>
                  </div>
                  {startingFromMonthly(act.rateCard) != null ? (
                    <div className="dim mono" style={{ fontSize: 11.5 }}>
                      residency from{' '}
                      <Price
                        minor={startingFromMonthly(act.rateCard)!}
                        currency={act.rateCard.currency}
                        suffix="/mo"
                        short
                      />
                    </div>
                  ) : null}
                  {/* Says where the ≈ figures come from and that they are not the deal. */}
                  <CurrencyNote />
                </div>
                {user?.role === 'venue' ? (
                  <ShortlistButton entertainerId={act.id} shortlists={shortlists} />
                ) : null}
              </div>
              <div className="panel__body">
                {user?.role === 'venue' ? (
                  <InquiryPanel
                    entertainerId={act.id}
                    acceptsShortTerm={act.acceptsShortTerm}
                    acceptsLongTerm={act.acceptsLongTerm}
                    contractLengths={act.contractLengths}
                    residencyInquiryPolicy={act.residencyInquiryPolicy}
                    rateCard={act.rateCard}
                    blocks={act.blocks}
                    cities={cities}
                    defaultCityId={act.homeCity.id}
                    defaultDate={focusDate}
                  />
                ) : user ? (
                  <p className="muted">
                    {viewerOwnsIt
                      ? 'This is how venues see your profile.'
                      : 'Only venue accounts can send an inquiry.'}
                  </p>
                ) : (
                  <div className="stack" style={{ gap: 10 }}>
                    <p className="muted">Sign in as a venue to check this date and send an inquiry.</p>
                    <Link className="btn btn--primary btn--block" href="/signin">
                      Sign in
                    </Link>
                    <Link className="btn btn--block" href="/signup">
                      Create a venue account
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
