# Encore

A two-sided marketplace connecting restaurants and hotels with entertainers —
singers, bands, magicians, instrumentalists, DJs — replacing manual outreach
with searchable profiles, live availability and published rates.

The problem it removes: today a venue finds a contact, messages them, waits, and
only then learns whether the act is even free on the date. Here the venue sees
availability and price before it sends anything.

## Running it

```bash
npm install
npm run seed     # builds data/encore.db with a demo marketplace
npm run dev      # http://localhost:3000
```

Sign in with any of these — the password is always `password`:

| Role        | Email                     | Lands on            |
| ----------- | ------------------------- | ------------------- |
| Venue       | `penthouse@encore.test`   | Shortlists          |
| Entertainer | `nadia@encore.test`       | Their workspace     |
| Agency      | `northline@encore.test`   | Their roster        |
| Admin       | `admin@encore.test`       | The review queue    |

Other scripts: `npm test` (115 tests), `npm run typecheck`, `npm run build`,
`npm run reset` (wipe and reseed).

## How it is put together

```
src/domain/     Pure rules. No database, no framework, no I/O.
src/db/         Schema, connection, repositories — the only place SQL lives.
src/services/   Cross-cutting operations that must succeed or fail as one.
src/app/        Next.js App Router pages and server actions.
src/components/ Presentation.
tests/          Unit tests over the domain, integration tests over the services.
```

The domain layer is pure on purpose. It means the booking panel in the browser
can quote a price by calling the very same `resolveHourlyRate` the server uses
when it creates the inquiry, so the figure a venue is shown cannot drift from
the figure it is charged.

Next.js 15 (App Router) · React 19 · SQLite via `better-sqlite3` · no ORM, no
CSS framework, no auth library. Money is stored as integer minor units; dates
are bare `YYYY-MM-DD` strings, because a booking is about a calendar day in the
venue's city, not an instant.

## The rules worth knowing

### Gig type, not location, decides who is eligible

This is the rule that makes search useful, and it lives in `src/domain/search.ts`:

| Search                      | Who appears                                                                |
| --------------------------- | -------------------------------------------------------------------------- |
| One-off, a city and a date  | Acts based in, travelling to, or within travel range of that city — and free on the date |
| Residency, a city           | Acts based in that city who take residencies, **plus** acts anywhere marked open to relocate |
| Residency, no city          | The global open-to-long-term pool, filtered on category, genre and budget alone |

So a one-off local gig never surfaces someone in another country, while a
multi-month contract search reaches the relocation pool. Every result carries
the reason it matched, which is what the "Open to relocation" tag on a card is.

### Rates resolve in a fixed order

`special-date rate > [day-of-week × time-block] rule > base hourly rate`

A New Year's Eve override beats the ordinary Thursday-evening rule outright.
Minimum hours are a floor on what is charged, not a validation error: a venue
asking for two hours against a three-hour minimum is quoted three. Residencies
are priced as a package — a weekly or monthly figure covering N nights a week,
with anything beyond N at the extra-night rate — never as hours × rate.

The "from" price on a search card deliberately excludes special dates, so a NYE
rate never masquerades as an act's starting price.

### No date is ever double-committed

Every date starts available. An entertainer blocks dates by hand — a single day,
a run, or a recurring weekday. A confirmed booking places a block of its own, and
that block is not theirs to lift: cancelling the booking is what frees the dates.
The database enforces this too, not just the domain layer — `deleteBlock` is
scoped to `source = 'manual'` in the SQL.

### Acceptance is always required

There is no instant-book. The whole inquiry state machine is one table in
`src/domain/inquiry.ts`, which is what makes "can a venue confirm its own
inquiry?" answerable by reading eight lines:

```
new → viewed → accepted | countered | declined → confirmed → completed
```

`cancelled` is reachable from any pre-`completed` state by either party, and
always logs a reason. A venue only ever reaches `confirmed` by accepting a
counter-offer the act made. Every move is written to `inquiry_events` with its
actor and reason, which is what the admin dispute view reads.

The UI does not decide which buttons to show — it asks the transition table for
this status and this actor, so a screen can never offer a move the server would
reject.

### Verified reviews are kept apart from self-submitted references

A review can only follow a `completed` booking, one per booking, from the
booking venue. References an act adds itself are moderated before a venue sees
them and are rendered in a separate section, so the two are never confused.

## Answers to the spec's open questions, as built

- **Commission or subscription?** Subscription, from entertainers. There is a
  `subscriptions` table and no commission anywhere in the booking path.
- **Instant-book?** No. Every booking passes through the act's acceptance.
- **Travel, visa and accommodation for relocation contracts?** Left to the
  parties in the message thread, which persists past confirmation for exactly
  this.
- **Agencies and managers — launch or phase 2?** Built in. An agency account
  manages a roster, acts on its acts' inquiries and calendars, and is notified
  alongside them. A managed profile cannot go live without declaring its
  representation, and venues see that note on the profile.

## What is not built

- Email and push delivery. Notifications are persisted as rows (`notifications`),
  which is the hard part; sending them is a delivery adapter over that table.
- File uploads. Media is referenced by URL — YouTube, Vimeo, Instagram — which is
  what the spec describes for video. Photo galleries render generated artwork in
  place of real press shots.
- Payment collection for the subscription. The plan, status and renewal date are
  modelled; there is no billing provider wired up.
