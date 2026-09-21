/**
 * How it works, told twice — once for each side of the marketplace.
 *
 * The steps are the product's actual rules, not marketing: rates really do
 * resolve before an inquiry is sent, a confirmation really does block the
 * calendar by itself, and nothing is ever booked without the act accepting.
 */
import Link from 'next/link';

interface Step {
  title: string;
  body: string;
}

const FOR_ARTISTS: Step[] = [
  {
    title: 'Build the profile once',
    body: 'Reel, photos, bio, awards, references. One video is the minimum to go live - nobody books what they cannot watch.',
  },
  {
    title: 'Publish your rates',
    body: 'An hourly rate per day and time of day, your minimum hours, special dates like New Year’s Eve, and a monthly package if you take residencies.',
  },
  {
    title: 'Keep your calendar honest',
    body: 'Block what you cannot play - a single night, a run, or every Monday. A confirmed booking blocks itself, so a date is never promised twice.',
  },
  {
    title: 'Answer on your terms',
    body: 'Accept, counter or decline. Nothing is ever booked without you saying yes, and the negotiation stays in one thread.',
  },
  {
    title: 'Keep your fee',
    body: 'Book the Act runs on a subscription from artists. No commission is taken out of what a venue pays you.',
  },
];

const FOR_VENUES: Step[] = [
  {
    title: 'Search for the night you actually have',
    body: 'A one-off and a residency are different searches. A single date shows only acts who can reach you and are free; a residency also reaches acts elsewhere who will relocate.',
  },
  {
    title: 'See the price before you speak to anyone',
    body: 'Rates are published in advance and resolved for your date - including special-date pricing - so cost is never a conversation you have to start.',
  },
  {
    title: 'Check availability, not inboxes',
    body: 'Every profile shows a live calendar. Green is free, red is taken. No waiting two days to find out.',
  },
  {
    title: 'Shortlist and compare',
    body: 'Group the acts you are weighing for the same night into a named collection, so three rooftop singers stay together instead of scattering through your favourites.',
  },
  {
    title: 'Send one inquiry, settle it on-platform',
    body: 'The rate pre-fills and stays editable as an offer. Agree terms in the thread, confirm, and leave a verified review once the gig is done.',
  },
];

function Column({
  eyebrow,
  title,
  blurb,
  steps,
  cta,
  accent,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  steps: Step[];
  cta: { href: string; label: string };
  /** A token, not a hex — the light theme darkens these for contrast. */
  accent: string;
}) {
  return (
    <div className="panel" style={{ ['--accent' as string]: accent }}>
      <div className="panel__head" style={{ display: 'block' }}>
        <div className="eyebrow" style={{ color: 'var(--accent)' }}>
          {eyebrow}
        </div>
        <h3 className="title" style={{ fontSize: 20, margin: '6px 0 4px' }}>
          {title}
        </h3>
        <p className="dim" style={{ fontSize: 13 }}>
          {blurb}
        </p>
      </div>

      <ol className="stack" style={{ gap: 0, listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((step, i) => (
          <li
            key={step.title}
            style={{
              display: 'flex',
              gap: 14,
              padding: '15px 18px',
              borderBottom: i === steps.length - 1 ? 'none' : '1px solid var(--line-soft)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: 'none',
                width: 26,
                height: 26,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                color: 'var(--accent)',
                font: '600 11px var(--font-mono)',
              }}
            >
              {i + 1}
            </span>
            <span>
              <span style={{ display: 'block', font: '600 14px var(--font-sans)' }}>{step.title}</span>
              <span className="muted" style={{ display: 'block', fontSize: 13, marginTop: 3, lineHeight: 1.55 }}>
                {step.body}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div style={{ padding: 18, borderTop: '1px solid var(--line-soft)' }}>
        <Link className="btn btn--primary btn--block" href={cta.href}>
          {cta.label}
        </Link>
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" style={{ scrollMarginTop: 24 }}>
      <div style={{ marginBottom: 18 }}>
        <div className="eyebrow">How it works</div>
        <h2 className="display" style={{ fontSize: 28, margin: '6px 0 8px' }}>
          Two sides, one calendar
        </h2>
        <p className="lede">
          Artists publish what they charge and when they are free. Venues see both before they send a word. The
          booking is agreed in between.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 20 }}>
        <Column
          eyebrow="For artists"
          title="Get booked without the back-and-forth"
          blurb="Singers, bands, magicians, DJs, instrumentalists - solo or with an agent."
          steps={FOR_ARTISTS}
          cta={{ href: '/signup', label: 'List your act' }}
          accent="var(--pink)"
        />
        <Column
          eyebrow="For venues"
          title="Know the date and the price up front"
          blurb="Restaurants, hotels, bars and event teams."
          steps={FOR_VENUES}
          cta={{ href: '/search', label: 'Find an act' }}
          accent="var(--blue)"
        />
      </div>
    </section>
  );
}
