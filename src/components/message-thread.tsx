'use client';

/**
 * The thread attached to an inquiry. It persists past confirmation, because
 * load-in times and monitor sends are exactly what gets discussed after the
 * price is agreed.
 */
import { useActionState, useRef, useEffect } from 'react';
import { sendMessageAction, type ActionState } from '@/app/actions';
import type { MessageRow } from '@/db/repo';
import { clockTime } from '@/lib/format';

export function MessageThread({
  inquiryId,
  messages,
  viewerId,
}: {
  inquiryId: string;
  messages: MessageRow[];
  viewerId: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendMessageAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: 620 }}>
      <div className="panel__head">
        <span className="eyebrow">Thread</span>
        <span className="dim" style={{ fontSize: 12 }}>
          Negotiation and logistics stay on Book the Act
        </span>
      </div>
      <div className="thread" style={{ flex: 1, minHeight: 200 }}>
        {messages.length === 0 ? (
          <p className="dim" style={{ fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No messages yet - say hello.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`bubble bubble--${m.senderId === viewerId ? 'me' : 'them'}`}>
              {m.body}
              <span className="bubble__time">
                {m.senderId === viewerId ? 'You' : m.senderName} · {clockTime(m.createdAt)}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form ref={formRef} action={action} className="composer">
        <input type="hidden" name="inquiryId" value={inquiryId} />
        <textarea
          className="textarea"
          name="body"
          placeholder="Arrival time, set lengths, load-in…"
          style={{ minHeight: 44 }}
          required
        />
        <button className="btn btn--primary" type="submit" disabled={pending}>
          {pending ? '…' : 'Send'}
        </button>
      </form>
      {state.error ? (
        <div style={{ padding: '0 18px 14px' }}>
          <div className="notice notice--error">{state.error}</div>
        </div>
      ) : null}
    </div>
  );
}
