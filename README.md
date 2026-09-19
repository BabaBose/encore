# Book the Act

**Great nights start with great acts.**

A two-sided marketplace connecting restaurants and hotels with entertainers —
singers, bands, magicians, instrumentalists, DJs — replacing manual outreach
with searchable profiles, live availability and published rates.

The problem it removes: today a venue finds a contact, messages them, waits, and
only then learns whether the act is even free on the date. Here the venue sees
availability and price before it sends anything.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

With no `DATABASE_URL` set, the app boots an in-process Postgres (PGlite) under
`data/` and applies the schema itself, so a fresh clone runs with nothing to
install or connect to. Load the demo marketplace into it with `npm run db:push`.

Against a real database — Supabase, or any Postgres — set `DATABASE_URL` and run
the same command:

```bash
export DATABASE_URL='postgresql://…'   # Supabase: the transaction pooler, port 6543
npm run db:push                        # applies the schema; seeds only if empty
npm run dev
```

Sign in with any of these — the password is always `password`:

| Role        | Email                     | Lands on            |
| ----------- | ------------------------- | ------------------- |
| Venue       | `penthouse@booktheact.test`   | Shortlists          |
| Entertainer | `nadia@booktheact.test`       | Their workspace     |
| Agency      | `northline@booktheact.test`   | Their roster        |
| Admin       | `admin@booktheact.test`       | The review queue    |

Other scripts: `npm test`, `npm run typecheck`, `npm run build`, and
`npm run db:reset` to reload the demo data over whatever is there.

## Brand

The name, tagline and domain live in `src/lib/brand.ts`; nothing hardcodes
them in copy.

The mark is a three-by-three grid with the centre cell lit in the accent — the
act in the middle of the room. `src/components/logo.tsx` draws it from the
ratios in the brand design, so the 24px rail mark and the 72px app tile are the
same drawing rather than two hand-tuned ones. It has two variants: `outline`
for the everyday lockup, and `filled` for the app tile and favicon
(`src/app/icon.svg`, `src/app/apple-icon.svg`).

**Each theme has its own accent palette.** The bright accents are built for a
near-black canvas and fall to roughly 2.5:1 on warm paper, which fails for the
small text that carries them — a rate on a card, a match reason. The light
theme therefore darkens all six and flips text on an accent fill to white. An
act is stored with a dark-canvas hex, so `resolveAccent` in `src/lib/accents.ts`
maps it to a CSS token rather than a literal; swapping theme swaps every act's
tint with it. A test asserts that every seeded accent resolves to a token and
that both themes define it.

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

Next.js 15 (App Router) · React 19 · Postgres on Supabase · no ORM, no CSS
framework, no auth library. Money is stored as integer minor units; dates are
bare `YYYY-MM-DD` strings, because a booking is about a calendar day in the
venue's city, not an instant.

### The database

Everything goes through one small `Sql` interface (`src/db/client.ts`) rather
than a driver, so the same repository code runs against Supabase in production
and against an in-process Postgres in the tests. Both are real Postgres — the
tests are not checking a dialect that never ships.

Three things worth knowing:

- **Connections are held on `globalThis`.** A bundler emits the client module
  into more than one route chunk, so a plain module-level singleton quietly
  becomes several. Against Supabase that only wastes connections; against the
  local file-backed database the copies diverge, and a session written by a
  server action is invisible to the page that follows it.
- **Loading entertainers is batched.** A list query fetches genres, travel
  cities, rates and calendars for the whole page in one query each. Per row, one
  search was fifty round trips.
- **Postgres returns `bigint` and `count(*)` as strings**, to avoid losing
  precision in JavaScript. `num()` in the repository layer is where that stops.

### Deploying

`npm run db:push` applies the schema and seeds the demo data **only if the
database has no accounts in it**, so the first deploy bootstraps itself and no
later deploy can wipe real bookings. It is the Vercel build command, ahead of
`next build`.

The Supabase project needs `DATABASE_URL` set in the Vercel environment — the
transaction pooler (port 6543), which is what suits serverless.

**The `public` schema is locked against Supabase's Data API.** Supabase
publishes it over PostgREST, so without this every table — password hashes and
session tokens included — would be readable with the project's anon key. The
schema enables row level security on every table and defines no policies, which
denies that API outright; the app is unaffected because it connects as the table
owner, which bypasses RLS.

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

### A busy calendar is not a refusal — the act decides

A one-off clash is absolute: nobody plays two rooms on the same night, so a
taken date always removes an act from a one-off search for it.

A residency is different. A six-month contract with a handful of gigs already
in it is something the two sides work out in the thread, and whether that is
worth hearing about is the act's call, not the platform's. Each act picks one
of two settings, under **Show me in residency searches** on their profile:

- **Only when that window is largely free** — they drop out of a residency
  search once about a fifth of the window is spoken for, so they only hear
  about contracts they could take as they stand.
- **Always, even if I have gigs booked then** — they stay visible whatever the
  calendar says.

Staying visible never means hiding the truth. An act surfaced on a busy window
is shown with the conflict attached ("71 of 92 days already booked — open to
talking") on the card, in the booking panel and on the profile calendar, and
ranks below acts who are genuinely clear. Nothing about the confirmation rules
changes: the dates still have to be free when the booking is confirmed.

### Rates resolve in a fixed order

`special-date rate > [day-of-week × time-block] rule > base hourly rate`

A New Year's Eve override beats the ordinary Thursday-evening rule outright.
Minimum hours are a floor on what is charged, not a validation error: a venue
asking for two hours against a three-hour minimum is quoted three. Residencies
are priced as a package — a weekly or monthly figure covering N nights a week,
with anything beyond N at the extra-night rate — never as hours × rate.

The "from" price on a search card deliberately excludes special dates, so a NYE
rate never masquerades as an act's starting price.

### A listing is priced in one currency; conversion is a courtesy

An act lists in the currency they are paid in, and that figure is what every
surface shows first. A visitor from elsewhere gets an approximation beside it —
`AED 350 ≈ £75` — never instead of it, always rounded, always marked with `≈`.
Nothing in the booking flow is ever agreed in the converted figure.

The visitor's currency is resolved in this order, and the first answer wins:

1. a choice they made, kept in the `booktheact_currency` cookie for a year;
2. the country the request came from (`x-vercel-ip-country`, or `cf-ipcountry`);
3. the marketplace default, AED.

IP geolocation is wrong often enough — a VPN, a roaming phone, a corporate
egress in another country — that it can only ever be a starting point, which is
why the picker in the header exists and why a choice outranks it.

Rates ship in a built-in table in `src/lib/fx.ts` with an `asOf` date that is
shown to the visitor, so an approximation can be judged rather than trusted.
Set `BOOKTHEACT_FX_URL` to a feed quoting rates against AED (open.er-api.com
and exchangerate.host both work) to refresh them; the response is cached for six
hours and any failure — a bad status, the wrong base currency, too few
currencies — falls back to the built-in table rather than showing nothing.

`src/domain/currency.ts` holds the whole thing and touches neither the network
nor the request, which is why it can be tested. A missing rate yields no
conversion at all, never a wrong number.

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
