'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProposalContent, ProposalStatus } from '@/lib/types/proposal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { ProposalStatusPill } from './proposal-status-pill';
import { ProposalPreview } from './proposal-preview';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

type Mode = 'edit' | 'preview';

export function ProposalEditor({
  proposalId,
  backHref,
  backLabel = 'Back',
  initialTitle,
  initialStatus,
  initialContent,
  initialSentAt,
  initialRevision = 1,
  initialAcceptedAt,
  initialAcceptedByName,
  initialAcceptedByIp,
  initialAcceptedByUserAgent,
}: {
  proposalId: string;
  /** Where the editor's back/after-delete navigation goes. */
  backHref: string;
  backLabel?: string;
  initialTitle: string;
  initialStatus: ProposalStatus;
  initialContent: ProposalContent;
  initialSentAt: string | null;
  /** v1, v2, … — bumps every Revise & Resend. Default 1 for old rows. */
  initialRevision?: number;
  initialAcceptedAt?: string | null;
  initialAcceptedByName?: string | null;
  initialAcceptedByIp?: string | null;
  initialAcceptedByUserAgent?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  // Read status straight from the prop so a router.refresh() after Send
  // immediately flips the button visibility without a hard reload.
  const status = initialStatus;
  const revision = initialRevision;
  const isAccepted = status === 'accepted';
  const isSent = status === 'sent';
  // Locked: accepted (permanent) or sent (until Revise & Resend unlocks it).
  const isLocked = isAccepted || isSent;
  // Force preview mode when locked.
  const [mode, setMode] = useState<Mode>(isLocked ? 'preview' : 'edit');
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState<ProposalContent>(initialContent);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseBusy, setReviseBusy] = useState(false);

  const totalCents = content.investment.total_cents;

  async function save(opts: { silent?: boolean } = {}): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          total_cents: totalCents,
          content_json: content,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.error ?? 'Failed to save.';
        setError(msg);
        toast.error("Couldn't save proposal", msg);
        return false;
      }
      setSavedAt(new Date());
      if (!opts.silent) toast.success('Proposal saved');
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function send() {
    setSendBusy(true);
    try {
      // Save before sending so the shipped draft matches what's in the form.
      const ok = await save({ silent: true });
      if (!ok) return;
      const res = await fetch(`/api/admin/proposals/${proposalId}/send`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.error ?? 'Failed to send.';
        setError(msg);
        toast.error("Couldn't send proposal", msg);
        return;
      }
      toast.success('Proposal sent', 'Client has been notified.');
    } finally {
      setSendBusy(false);
      setSendOpen(false);
      router.refresh();
    }
  }

  async function destroy() {
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error("Couldn't delete proposal");
        return;
      }
      toast.success('Proposal deleted');
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
      router.push(backHref);
    }
  }

  async function revise() {
    setReviseBusy(true);
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}/revise`, {
        method: 'POST',
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        revision?: number;
      };
      if (!res.ok) {
        const msg = j.error ?? 'Failed to revise.';
        toast.error("Couldn't revise proposal", msg);
        return;
      }
      toast.success(
        'Proposal unlocked',
        `Now editable as v${j.revision ?? '?'}. Re-send when ready.`,
      );
      setMode('edit');
      router.refresh();
    } finally {
      setReviseBusy(false);
      setReviseOpen(false);
    }
  }

  // Helpers for nested content updates
  function patch<K extends keyof ProposalContent>(
    key: K,
    value: ProposalContent[K],
  ) {
    setContent((c) => ({ ...c, [key]: value }));
  }
  function patchScope<K extends keyof ProposalContent['scope']>(
    key: K,
    value: ProposalContent['scope'][K],
  ) {
    setContent((c) => ({ ...c, scope: { ...c.scope, [key]: value } }));
  }
  return (
    <div className="space-y-8">
      {/* Sticky action bar — hidden in print */}
      <div className="sticky top-16 z-20 -mx-8 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-8 py-3 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={backHref}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
          >
            ← {backLabel}
          </Link>
          <span aria-hidden className="h-3 w-px bg-border" />
          <ProposalStatusPill status={status} />
          {initialSentAt ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
              Sent {formatDate(initialSentAt)}
            </span>
          ) : null}
          {initialAcceptedAt ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">
              Signed {formatDate(initialAcceptedAt)}
            </span>
          ) : null}
          <span aria-hidden className="h-3 w-px bg-border" />
          {saving ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper">
              Saving…
            </span>
          ) : savedAt ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">
              Saved {savedAt.toLocaleTimeString()}
            </span>
          ) : null}
          {error ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger">
              {error}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => !isLocked && setMode('edit')}
              disabled={isLocked}
              title={
                isAccepted
                  ? 'Locked — proposal is signed'
                  : isSent
                    ? 'Locked — Revise & Resend to edit'
                    : undefined
              }
              className={cn(
                'px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                mode === 'edit'
                  ? 'bg-copper-soft/60 text-copper'
                  : 'bg-surface text-ink-muted hover:text-ink',
              )}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className={cn(
                'border-l border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors',
                mode === 'preview'
                  ? 'bg-copper-soft/60 text-copper'
                  : 'bg-surface text-ink-muted hover:text-ink',
              )}
            >
              Preview
            </button>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={isAccepted}
            title={isAccepted ? 'Accepted proposals cannot be deleted' : undefined}
          >
            Delete
          </Button>
          {!isLocked ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
          ) : null}
          {status === 'draft' ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setSendOpen(true)}
              disabled={sendBusy}
            >
              {revision > 1 ? 'Re-send' : 'Send'}
            </Button>
          ) : null}
          {isSent ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setReviseOpen(true)}
              disabled={reviseBusy}
            >
              Revise & resend
            </Button>
          ) : null}
        </div>
      </div>

      {isAccepted ? (
        <div className="rounded-xl border border-success/30 bg-success/5 px-5 py-3 print:hidden">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-success">
            Locked — accepted by the client
          </p>
          <p className="mt-0.5 font-sans text-xs text-ink-muted">
            This proposal is signed and cannot be edited or deleted. You can
            still preview, print, or open the signature block below.
          </p>
        </div>
      ) : isSent ? (
        <div className="rounded-xl border border-copper/30 bg-copper-soft/25 px-5 py-3 print:hidden">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
            Sent · v{revision} — locked while client reviews
          </p>
          <p className="mt-0.5 font-sans text-xs text-ink-muted">
            The client is looking at this exact version. To make changes,
            click <span className="text-ink">Revise &amp; resend</span> — the
            current content snapshots into the audit log and the proposal
            unlocks for editing as v{revision + 1}.
          </p>
        </div>
      ) : null}

      {mode === 'preview' ? (
        <ProposalPreview
          title={title}
          content={content}
          signature={
            isAccepted
              ? {
                  acceptedAt: initialAcceptedAt ?? null,
                  acceptedByName: initialAcceptedByName ?? null,
                  acceptedByIp: initialAcceptedByIp ?? null,
                  acceptedByUserAgent: initialAcceptedByUserAgent ?? null,
                }
              : undefined
          }
        />
      ) : (
        <EditorForm
          title={title}
          setTitle={setTitle}
          content={content}
          setContent={setContent}
          patch={patch}
          patchScope={patchScope}
        />
      )}

      <ConfirmDialog
        open={sendOpen}
        tone="default"
        title="Send this proposal?"
        description={
          <>
            Saves any unsaved edits, then locks the proposal as{' '}
            <span className="font-mono text-ink">Sent</span>. The client will be
            able to view and accept it from their portal.
            <br />
            <span className="font-mono text-[11px] text-ink-subtle">
              (Email dispatch via Resend wires up in Step 9 — for now the
              client sees the new proposal on their portal dashboard.)
            </span>
          </>
        }
        confirmLabel="Save & send"
        busy={sendBusy}
        onCancel={() => (sendBusy ? undefined : setSendOpen(false))}
        onConfirm={send}
      />

      <ConfirmDialog
        open={deleteOpen}
        tone="danger"
        title="Delete proposal"
        description={
          <>
            <span className="font-mono text-ink">{title}</span> will be
            permanently removed from this project. The audit log retains the
            record.
          </>
        }
        confirmLabel="Delete proposal"
        busy={deleteBusy}
        onCancel={() => (deleteBusy ? undefined : setDeleteOpen(false))}
        onConfirm={destroy}
      />

      <ConfirmDialog
        open={reviseOpen}
        tone="default"
        title="Revise & resend?"
        description={
          <>
            Unlocks the proposal for editing and bumps it to{' '}
            <span className="font-mono text-ink">v{revision + 1}</span>. The
            current content (v{revision}) is snapshotted to the audit log
            so you can prove what the client originally saw. After your
            edits, click <span className="text-ink">Re-send</span> to email
            them the updated version.
          </>
        }
        confirmLabel="Unlock for editing"
        busy={reviseBusy}
        onCancel={() => (reviseBusy ? undefined : setReviseOpen(false))}
        onConfirm={revise}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The form body — big, but grouped into numbered sections.
 * ------------------------------------------------------------------------- */
function EditorForm({
  title,
  setTitle,
  content,
  setContent,
  patch,
  patchScope,
}: {
  title: string;
  setTitle: (v: string) => void;
  content: ProposalContent;
  setContent: (updater: (c: ProposalContent) => ProposalContent) => void;
  patch: <K extends keyof ProposalContent>(
    key: K,
    value: ProposalContent[K],
  ) => void;
  patchScope: <K extends keyof ProposalContent['scope']>(
    key: K,
    value: ProposalContent['scope'][K],
  ) => void;
}) {
  return (
    <div className="space-y-12">
      {/* 01 — Header */}
      <FormSection number="01" title="Proposal header">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" span={2}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Signature site build · Proposal v1"
            />
          </Field>
          <Field label="Client name">
            <Input
              value={content.client.name}
              onChange={(e) =>
                patch('client', { ...content.client, name: e.target.value })
              }
            />
          </Field>
          <Field label="Contact email">
            <Input
              type="email"
              value={content.client.contact_email}
              onChange={(e) =>
                patch('client', {
                  ...content.client,
                  contact_email: e.target.value,
                })
              }
            />
          </Field>
          <Field label="Prepared date">
            <Input
              type="date"
              value={content.prepared_date}
              onChange={(e) => patch('prepared_date', e.target.value)}
            />
          </Field>
          <Field label="Agreement version">
            <Input
              value={content.agreement_version}
              onChange={(e) => patch('agreement_version', e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      {/* 02 — Executive summary */}
      <FormSection number="02" title="Executive summary">
        <TextArea
          rows={5}
          value={content.executive_summary}
          onChange={(v) => patch('executive_summary', v)}
          placeholder="One to three paragraphs framing the engagement."
        />
      </FormSection>

      {/* 03 — Project goals */}
      <FormSection
        number="03"
        title="Project goals"
        description="Add structured goals with a short title and a sentence of detail."
      >
        <RepeatingList
          items={content.project_goals}
          onChange={(next) => patch('project_goals', next)}
          newItem={() => ({ title: '', description: '' })}
          addLabel="Add goal"
          renderItem={(item, update) => (
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <Input
                value={item.title}
                placeholder="Goal title"
                onChange={(e) => update({ ...item, title: e.target.value })}
              />
              <Input
                value={item.description}
                placeholder="Description"
                onChange={(e) =>
                  update({ ...item, description: e.target.value })
                }
              />
            </div>
          )}
        />
      </FormSection>

      {/* 04 — Scope */}
      <FormSection number="04" title="Scope">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pages count">
            <Input
              type="number"
              min={0}
              value={String(content.scope.pages_count)}
              onChange={(e) =>
                patchScope('pages_count', Number(e.target.value) || 0)
              }
            />
          </Field>
          <Field label="Post-launch support (months)">
            <Input
              type="number"
              min={0}
              value={String(content.scope.post_launch_support_months)}
              onChange={(e) =>
                patchScope(
                  'post_launch_support_months',
                  Number(e.target.value) || 0,
                )
              }
            />
          </Field>
          <Field label="Design" span={2}>
            <TextArea
              rows={2}
              value={content.scope.design}
              onChange={(v) => patchScope('design', v)}
            />
          </Field>
          <Field label="Content migration" span={2}>
            <TextArea
              rows={2}
              value={content.scope.content_migration}
              onChange={(v) => patchScope('content_migration', v)}
            />
          </Field>
          <Field label="Security">
            <Input
              value={content.scope.security}
              onChange={(e) => patchScope('security', e.target.value)}
            />
          </Field>
          <Field label="Performance">
            <Input
              value={content.scope.performance}
              onChange={(e) => patchScope('performance', e.target.value)}
            />
          </Field>
          <Field label="Integrations" span={2} hint="One per line">
            <LineArea
              rows={3}
              value={content.scope.integrations}
              onChange={(lines) => patchScope('integrations', lines)}
              placeholder={'ActiveCampaign\nGA4\nBasic SEO'}
            />
          </Field>
        </div>
      </FormSection>

      {/* 05 — Out of scope */}
      <FormSection
        number="05"
        title="Out of scope"
        description="Things this engagement doesn't cover. One per line."
      >
        <LineArea
          rows={4}
          value={content.out_of_scope}
          onChange={(lines) => patch('out_of_scope', lines)}
          placeholder={'Ongoing content production\nPaid ads management'}
        />
      </FormSection>

      {/* 06 — Timeline */}
      <FormSection number="06" title="Timeline">
        <div className="space-y-5">
          {(['phase_1', 'phase_2', 'phase_3'] as const).map((key, i) => {
            const phase = content.timeline[key];
            return (
              <div
                key={key}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper">
                  Phase {i + 1} · {phase.name}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-[140px_1fr]">
                  <Field label="Weeks">
                    <Input
                      value={phase.weeks}
                      onChange={(e) =>
                        setContent((c) => ({
                          ...c,
                          timeline: {
                            ...c.timeline,
                            [key]: { ...c.timeline[key], weeks: e.target.value },
                          },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Items" hint="One per line">
                    <LineArea
                      rows={3}
                      value={phase.items}
                      onChange={(lines) =>
                        setContent((c) => ({
                          ...c,
                          timeline: {
                            ...c.timeline,
                            [key]: { ...c.timeline[key], items: lines },
                          },
                        }))
                      }
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total weeks">
              <Input
                type="number"
                min={0}
                value={String(content.timeline.total_weeks)}
                onChange={(e) =>
                  setContent((c) => ({
                    ...c,
                    timeline: {
                      ...c.timeline,
                      total_weeks: Number(e.target.value) || 0,
                    },
                  }))
                }
              />
            </Field>
            <Field label="Target launch">
              <Input
                type="date"
                value={content.timeline.target_launch}
                onChange={(e) =>
                  setContent((c) => ({
                    ...c,
                    timeline: { ...c.timeline, target_launch: e.target.value },
                  }))
                }
              />
            </Field>
          </div>
        </div>
      </FormSection>

      {/* 07 — Investment */}
      <FormSection number="07" title="Investment">
        <InvestmentSection content={content} setContent={setContent} />
      </FormSection>

      {/* 08 — Assumptions */}
      <FormSection
        number="08"
        title="Assumptions"
        description="Things we're assuming. One per line."
      >
        <LineArea
          rows={3}
          value={content.assumptions}
          onChange={(lines) => patch('assumptions', lines)}
        />
      </FormSection>

      {/* 09 — Why LuxWeb */}
      <FormSection
        number="09"
        title="Why LuxWeb"
        description="Differentiators to reinforce the pitch. Give each a short title and a sentence."
      >
        <RepeatingList
          items={content.why_luxweb}
          onChange={(next) => patch('why_luxweb', next)}
          newItem={() => ({ title: '', description: '' })}
          addLabel="Add reason"
          renderItem={(item, update) => (
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <Input
                value={item.title}
                placeholder="Reason title"
                onChange={(e) => update({ ...item, title: e.target.value })}
              />
              <Input
                value={item.description}
                placeholder="Description"
                onChange={(e) =>
                  update({ ...item, description: e.target.value })
                }
              />
            </div>
          )}
        />
      </FormSection>

      {/* 10 — Next steps */}
      <FormSection
        number="10"
        title="Next steps"
        description="What happens after sign-off. One per line."
      >
        <LineArea
          rows={3}
          value={content.next_steps}
          onChange={(lines) => patch('next_steps', lines)}
        />
      </FormSection>
    </div>
  );
}

/* ----------------------------- tiny helpers ----------------------------- */

// Format integer cents → "5000.00"-style dollar string.
function centsToDollarStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Free-text dollar input → integer cents. Tolerates "5,000.50".
function dollarStrToCents(s: string): number {
  const cleaned = s.replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/**
 * Currency input that lets the user type freely (no per-keystroke
 * reformatting) and only commits to cents on blur. Re-syncs the displayed
 * text when `cents` changes from outside its own commit (e.g., total
 * recalculates an amount).
 *
 * Uses type="text" inputMode="decimal" so the browser doesn't show the
 * type=number spinner widget, which has been triggering unwanted ±1 changes
 * on the num pad and mouse wheel.
 */
function CurrencyInput({
  cents,
  onCommit,
  placeholder,
}: {
  cents: number;
  onCommit: (newCents: number) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState<string>(() => centsToDollarStr(cents));
  // Track the last cents value WE committed so we can ignore our own echo
  // and only re-sync display when cents truly changed externally.
  const lastCentsRef = useRef(cents);

  useEffect(() => {
    if (cents !== lastCentsRef.current) {
      lastCentsRef.current = cents;
      setText(centsToDollarStr(cents));
    }
  }, [cents]);

  function commit() {
    const newCents = dollarStrToCents(text);
    lastCentsRef.current = newCents;
    setText(centsToDollarStr(newCents));
    onCommit(newCents);
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function InvestmentSection({
  content,
  setContent,
}: {
  content: ProposalContent;
  setContent: (updater: (c: ProposalContent) => ProposalContent) => void;
}) {
  function setTotalCents(newTotalCents: number) {
    setContent((c) => ({
      ...c,
      investment: {
        ...c.investment,
        total_cents: newTotalCents,
        // Preserve each milestone's percent; recompute amount from new total.
        milestones: c.investment.milestones.map((m) => ({
          ...m,
          amount_cents: Math.round((newTotalCents * m.percent) / 100),
        })),
      },
    }));
  }

  function setMilestonePercent(index: number, percentRaw: number) {
    const percent = Math.max(0, Math.min(100, percentRaw));
    setContent((c) => ({
      ...c,
      investment: {
        ...c.investment,
        milestones: c.investment.milestones.map((m, i) =>
          i === index
            ? {
                ...m,
                percent,
                amount_cents: Math.round(
                  (c.investment.total_cents * percent) / 100,
                ),
              }
            : m,
        ),
      },
    }));
  }

  function setMilestoneAmountCents(index: number, amount_cents: number) {
    setContent((c) => {
      const total = c.investment.total_cents;
      const percent = total > 0 ? Math.round((amount_cents / total) * 100) : 0;
      return {
        ...c,
        investment: {
          ...c.investment,
          milestones: c.investment.milestones.map((m, i) =>
            i === index ? { ...m, amount_cents, percent } : m,
          ),
        },
      };
    });
  }

  function setMilestoneField(
    index: number,
    field: 'label' | 'due',
    value: string,
  ) {
    setContent((c) => ({
      ...c,
      investment: {
        ...c.investment,
        milestones: c.investment.milestones.map((m, i) =>
          i === index ? { ...m, [field]: value } : m,
        ),
      },
    }));
  }

  function addMilestone() {
    setContent((c) => ({
      ...c,
      investment: {
        ...c.investment,
        milestones: [
          ...c.investment.milestones,
          { label: '', percent: 0, amount_cents: 0, due: '' },
        ],
      },
    }));
  }

  function removeMilestone(index: number) {
    setContent((c) => ({
      ...c,
      investment: {
        ...c.investment,
        milestones: c.investment.milestones.filter((_, i) => i !== index),
      },
    }));
  }

  // Even-split: redistribute 100% across N milestones equally. Last row
  // absorbs any rounding remainder so percents sum to exactly 100.
  function splitEvenly() {
    setContent((c) => {
      const ms = c.investment.milestones;
      const n = ms.length;
      if (n === 0) return c;
      const baseP = Math.floor(100 / n);
      const remP = 100 - baseP * n;
      const total = c.investment.total_cents;
      const baseA = Math.floor(total / n);
      const remA = total - baseA * n;
      const next = ms.map((m, i) => {
        const isLast = i === n - 1;
        const percent = isLast ? baseP + remP : baseP;
        const amount_cents = isLast ? baseA + remA : baseA;
        return { ...m, percent, amount_cents };
      });
      return {
        ...c,
        investment: { ...c.investment, milestones: next },
      };
    });
  }

  const ms = content.investment.milestones;
  const sumCents = ms.reduce((s, m) => s + m.amount_cents, 0);
  const sumPct = ms.reduce((s, m) => s + m.percent, 0);
  const total = content.investment.total_cents;
  const drift = total - sumCents;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Total (USD)">
          <CurrencyInput cents={total} onCommit={setTotalCents} />
        </Field>
        <Field label="Net days">
          <Input
            type="text"
            inputMode="numeric"
            value={String(content.investment.net_days)}
            onChange={(e) =>
              setContent((c) => ({
                ...c,
                investment: {
                  ...c.investment,
                  net_days:
                    Math.max(0, Math.floor(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)),
                },
              }))
            }
          />
        </Field>
        <Field label="Late fee">
          <Input
            value={content.investment.late_fee}
            onChange={(e) =>
              setContent((c) => ({
                ...c,
                investment: { ...c.investment, late_fee: e.target.value },
              }))
            }
          />
        </Field>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink-muted">
              Payment milestones
            </p>
            <p className="mt-1 font-sans text-xs text-ink-subtle">
              Edit % and amount auto-fills, or vice-versa. Both columns are
              kept in sync with the total.
            </p>
          </div>
          {ms.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={splitEvenly}
            >
              Split evenly
            </Button>
          ) : null}
        </div>

        <div className="mt-3 space-y-2">
          {ms.map((m, i) => (
            <div
              key={i}
              className="grid items-center gap-3 sm:grid-cols-[1fr_90px_140px_1fr_auto]"
            >
              <Input
                value={m.label}
                placeholder="Label"
                onChange={(e) => setMilestoneField(i, 'label', e.target.value)}
              />
              <Input
                type="text"
                inputMode="numeric"
                value={String(m.percent)}
                placeholder="%"
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, '');
                  setMilestonePercent(i, Number(cleaned) || 0);
                }}
              />
              <CurrencyInput
                cents={m.amount_cents}
                placeholder="USD"
                onCommit={(c) => setMilestoneAmountCents(i, c)}
              />
              <Input
                value={m.due}
                placeholder="Due (e.g., On signing)"
                onChange={(e) => setMilestoneField(i, 'due', e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeMilestone(i)}
                aria-label="Remove milestone"
              >
                ×
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={addMilestone}>
            Add milestone
          </Button>
          {ms.length > 0 ? (
            <p
              className={cn(
                'font-mono text-[10px] uppercase tracking-[0.16em]',
                drift === 0 && sumPct === 100
                  ? 'text-success'
                  : 'text-warning',
              )}
            >
              {sumPct}% · ${centsToDollarStr(sumCents)}
              {drift !== 0
                ? ` (${drift > 0 ? '+' : ''}${centsToDollarStr(Math.abs(drift))} vs total)`
                : ''}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-semibold tabular-nums text-copper">
            {number}
          </span>
          <span aria-hidden className="h-3.5 w-px bg-copper/40" />
          <h3 className="font-display text-lg font-medium tracking-tight text-ink">
            {title}
          </h3>
        </div>
        {description ? (
          <p className="mt-1.5 font-sans text-sm text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  span,
  children,
}: {
  label: string;
  hint?: string;
  span?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', span === 2 && 'sm:col-span-2')}>
      <Label>{label}</Label>
      {children}
      {hint ? (
        <p className="font-sans text-xs text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

function TextArea({
  rows = 3,
  value,
  onChange,
  placeholder,
}: {
  rows?: number;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="block w-full rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/30"
    />
  );
}

function LineArea({
  rows = 3,
  value,
  onChange,
  placeholder,
}: {
  rows?: number;
  value: string[];
  onChange: (lines: string[]) => void;
  placeholder?: string;
}) {
  const joined = value.join('\n');
  return (
    <textarea
      rows={rows}
      value={joined}
      onChange={(e) =>
        onChange(
          e.target.value
            .split('\n')
            .map((l) => l.trim())
            .filter((l, i, arr) => (i === arr.length - 1 ? true : l.length > 0)),
        )
      }
      placeholder={placeholder}
      className="block w-full rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/30"
    />
  );
}

function RepeatingList<T>({
  items,
  onChange,
  newItem,
  addLabel,
  renderItem,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  newItem: () => T;
  addLabel: string;
  renderItem: (item: T, update: (next: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4"
        >
          <span className="mt-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-[11px] tabular-nums text-ink-subtle">
            {(i + 1).toString().padStart(2, '0')}
          </span>
          <div className="min-w-0 flex-1">
            {renderItem(item, (next) =>
              onChange(items.map((it, j) => (i === j ? next : it))),
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label="Remove"
            className="shrink-0 rounded-md border border-border bg-surface p-1.5 text-ink-muted transition-colors hover:border-danger/40 hover:text-danger"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, newItem()])}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        {addLabel}
      </button>
    </div>
  );
}
