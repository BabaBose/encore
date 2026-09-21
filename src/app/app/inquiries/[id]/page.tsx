/**
 * One inquiry: the booking context, the thread, and whatever moves this
 * viewer is actually allowed to make.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireUser } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { accessRoleFor, inquiryRange } from '@/services/booking';
import { canLeaveReview, STATUS_LABEL } from '@/domain/inquiry';
import { Shell } from '@/components/shell';
import { StatusPill, accentStyle } from '@/components/ui';
import { InquiryActions, ReviewForm } from '@/components/inquiry-actions';
import { MessageThread } from '@/components/message-thread';
import { formatDate, formatMoney, timeAgo, timeSince } from '@/lib/format';
import { TIME_BLOCK_LABELS } from '@/domain/types';

export const dynamic = 'force-dynamic';

export default async function InquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { badges, money } = await pageContext();

  const db = getDb();
  const inquiry = await repo.getInquiry(db, id);
  if (!inquiry) notFound();

  const actor = accessRoleFor(inquiry, user);
  if (!actor) notFound();

  // Opening a new inquiry is what marks it viewed, and reading the thread is
  // what clears its unread count — neither needs a separate button.
  if (actor === 'entertainer' && inquiry.status === 'new') {
    const { transitionInquiry } = await import('@/services/booking');
    await transitionInquiry(db, { inquiryId: id, to: 'viewed', actor, actorUserId: user.id });
  }
  await repo.markThreadRead(db, id, user.id);

  const fresh = (await repo.getInquiry(db, id))!;
  const messages = await repo.listMessages(db, id);
  const events = await repo.listInquiryEvents(db, id);
  const range = inquiryRange(fresh);
  const existingReview = await repo.reviewForInquiry(db, id);

  return (
    <Shell user={user} current="/app/inquiries" badges={badges} money={money}>
      <div className="page" style={accentStyle(fresh.entertainerAccent)}>
        <Link href="/app/inquiries" className="eyebrow" style={{ display: 'inline-block', marginBottom: 12 }}>
          ← All inquiries
        </Link>

        <div className="spread" style={{ marginBottom: 22 }}>
          <div>
            <h1 className="display" style={{ fontSize: 28 }}>
              {actor === 'venue' ? fresh.entertainerName : fresh.venueName}
            </h1>
            <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
              {fresh.eventType ?? (fresh.gigType === 'long_term' ? 'Residency' : 'Booking')} · opened{' '}
              {timeSince(fresh.createdAt)}
            </p>
          </div>
          <StatusPill status={fresh.status} />
        </div>

        <div className="split">
          <div className="stack" style={{ gap: 20 }}>
            <MessageThread inquiryId={id} messages={messages} viewerId={user.id} />

            {actor === 'venue' && canLeaveReview(fresh.status) && !existingReview ? (
              <ReviewForm inquiryId={id} entertainerName={fresh.entertainerName} />
            ) : null}

            <section className="panel">
              <div className="panel__head">
                <span className="eyebrow">History</span>
                <span className="dim" style={{ fontSize: 12 }}>
                  every move, with who made it
                </span>
              </div>
              <div className="listing">
                {events.map((e) => (
                  <div key={e.id} className="listing__item">
                    <div className="listing__main">
                      <div className="listing__name">
                        {e.fromStatus ? `${STATUS_LABEL[e.fromStatus]} → ` : ''}
                        {STATUS_LABEL[e.toStatus]}
                      </div>
                      <div className="listing__meta">
                        by the {e.actor}
                        {e.offer ? ` · ${formatMoney(e.offer, fresh.currency)}` : ''}
                        {e.reason ? ` · “${e.reason}”` : ''}
                      </div>
                    </div>
                    <span className="mono dim" style={{ fontSize: 11 }}>
                      {timeAgo(e.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="sticky stack" style={{ gap: 16 }}>
            <div className="panel">
              <div className="panel__head">
                <span className="eyebrow">Booking</span>
              </div>
              <div className="panel__body stack" style={{ gap: 16 }}>
                <div>
                  <div className="eyebrow">On the table</div>
                  <div className="title" style={{ fontSize: 22, marginTop: 4 }}>
                    {formatMoney(fresh.offerAmount, fresh.currency)}
                    {fresh.rateBasis === 'residency' ? (
                      <span className="dim" style={{ fontSize: 13, fontWeight: 500 }}>
                        {' '}
                        / month
                      </span>
                    ) : null}
                  </div>
                  {fresh.offerAmount !== fresh.quotedAmount ? (
                    <div className="dim mono" style={{ fontSize: 11.5, marginTop: 2 }}>
                      published rate was {formatMoney(fresh.quotedAmount, fresh.currency)}
                    </div>
                  ) : null}
                </div>

                <dl className="kv">
                  <dt>Type</dt>
                  <dd>{fresh.gigType === 'long_term' ? 'Residency' : 'One-off'}</dd>
                  {fresh.gigType === 'long_term' ? (
                    <>
                      <dt>Length</dt>
                      <dd>{fresh.months} months</dd>
                      <dt>Nights</dt>
                      <dd>{fresh.daysPerWeek ?? '-'} a week</dd>
                    </>
                  ) : (
                    <>
                      <dt>Time</dt>
                      <dd>{fresh.timeBlock ? TIME_BLOCK_LABELS[fresh.timeBlock] : '-'}</dd>
                      <dt>Hours</dt>
                      <dd>{fresh.hours ?? '-'}</dd>
                    </>
                  )}
                  <dt>Dates</dt>
                  <dd>{range ? `${formatDate(range.start)} - ${formatDate(range.end)}` : '-'}</dd>
                  <dt>City</dt>
                  <dd>{fresh.cityName ?? '-'}</dd>
                  <dt>Act</dt>
                  <dd>
                    <Link href={`/entertainers/${fresh.entertainerSlug}`} style={{ textDecoration: 'underline' }}>
                      {fresh.entertainerName}
                    </Link>
                  </dd>
                  <dt>Venue</dt>
                  <dd>{fresh.venueName}</dd>
                </dl>

                {fresh.notes ? (
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>
                      Notes
                    </div>
                    <p className="muted" style={{ fontSize: 13 }}>
                      {fresh.notes}
                    </p>
                  </div>
                ) : null}

                {fresh.cancelReason ? (
                  <div className="notice notice--error">{fresh.cancelReason}</div>
                ) : null}

                <hr className="divider" />

                <InquiryActions
                  inquiryId={id}
                  status={fresh.status}
                  actor={actor}
                  currency={fresh.currency}
                  offerAmount={fresh.offerAmount}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
