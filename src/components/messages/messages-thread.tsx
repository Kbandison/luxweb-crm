'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/formatters';

type Message = {
  id: string;
  threadId: string;
  senderId: string;
  senderEmail: string | null;
  senderName: string | null;
  senderRole: 'admin' | 'client' | null;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type Props = {
  projectId: string;
  threadId: string | null;
  viewerId: string;
  viewerRole: 'admin' | 'client';
  initialMessages: Message[];
};


/**
 * Reads the thread on mount + refreshes on focus every 10s. Optimistic
 * append on send. Swaps to Realtime later (see Step 10 notes).
 */
export function MessagesThread({
  projectId,
  threadId,
  viewerId,
  viewerRole,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/thread?project_id=${projectId}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = (await res.json()) as { messages: Message[] };
      setMessages(j.messages);
    } catch {
      /* silent */
    }
  }, [projectId]);

  // Poll on focus + every 10s while open.
  useEffect(() => {
    function onFocus() {
      void refresh();
    }
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(refresh, 10_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [refresh]);

  // Mark-read on mount + when new inbound messages arrive.
  useEffect(() => {
    if (!threadId) return;
    const hasUnreadInbound = messages.some(
      (m) => m.senderId !== viewerId && !m.readAt,
    );
    if (!hasUnreadInbound) return;
    void fetch('/api/messages/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread_id: threadId }),
    });
  }, [threadId, messages, viewerId]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError(null);

    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      threadId: threadId ?? '',
      senderId: viewerId,
      senderEmail: null,
      senderName: 'You',
      senderRole: viewerRole,
      body: text,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setBody('');

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, body: text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to send.');
        setMessages((m) => m.filter((x) => x.id !== tempId));
        return;
      }
      await refresh();
    } catch {
      setError('Network error. Try again.');
      setMessages((m) => m.filter((x) => x.id !== tempId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-240px)] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Header */}
      <header className="relative isolate overflow-hidden border-b border-border px-6 py-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
        />
        <div className="relative flex items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
              Project conversation
            </p>
            <h2 className="mt-1 font-display text-lg font-medium tracking-tight text-ink">
              {viewerRole === 'admin' ? 'Message the client' : 'Message the team'}
            </h2>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </p>
        </div>
      </header>

      {/* Scroller */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-sm text-center font-sans text-sm text-ink-muted">
              No messages. Say hi — messages here are private to this
              project and you&apos;ll get an email when the other side replies.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => {
              const mine = m.senderId === viewerId;
              const prev = messages[i - 1];
              const showMeta =
                !prev ||
                prev.senderId !== m.senderId ||
                new Date(m.createdAt).getTime() -
                  new Date(prev.createdAt).getTime() >
                  5 * 60 * 1000; // 5min gap
              return (
                <li
                  key={m.id}
                  className={cn(
                    'flex flex-col',
                    mine ? 'items-end' : 'items-start',
                  )}
                >
                  {showMeta ? (
                    <p
                      className={cn(
                        'mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle',
                        mine ? 'text-right' : 'text-left',
                      )}
                    >
                      {mine ? 'You' : (m.senderName ?? m.senderEmail ?? 'Unknown')}
                      <span aria-hidden> · </span>
                      {formatRelative(m.createdAt)}
                    </p>
                  ) : null}
                  <div
                    className={cn(
                      'max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 font-sans text-sm leading-relaxed',
                      mine
                        ? 'bg-copper text-copper-foreground'
                        : 'bg-surface-2 text-ink',
                    )}
                  >
                    {m.body}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={send}
        className="border-t border-border bg-surface-2/30 px-4 py-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                const form = e.currentTarget.form;
                if (form) form.requestSubmit();
              }
            }}
            rows={2}
            placeholder={
              viewerRole === 'admin'
                ? 'Write to the client…'
                : 'Write to the team…'
            }
            className="flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/30"
            maxLength={8000}
          />
          <Button
            type="submit"
            size="sm"
            disabled={busy || !body.trim()}
            className="shrink-0"
          >
            {busy ? 'Sending…' : 'Send'}
          </Button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
            ⌘↵ to send
          </p>
          {error ? (
            <p role="alert" className="font-sans text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

