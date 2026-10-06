'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  ClientParty,
  ProposalContent,
  ProposalCarePlan,
  ProposalStatus,
  TimelinePhase,
} from '@/lib/types/proposal';
import {
  DEFAULT_CARE_PLAN,
  clientParty,
  hourlyRateCents,
  isPhasePlan,
  pairTimelineAndMilestones,
  withCarePlanDefaults,
} from '@/lib/types/proposal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { ProposalStatusPill } from './proposal-status-pill';
import { AgreementSummary } from '@/components/contract/agreement-summary';
import { ContractBody } from '@/components/contract/contract-body';
import { formatDate, formatDateTime } from '@/lib/formatters';
import { CURRENT_AGREEMENT_VERSION } from '@/lib/contracts/versions';
import { DEFAULT_EXPIRY_DAYS } from '@/lib/agreements/expiry';
import { OFFLINE_PAYMENT_METHODS } from '@/lib/invoices/payment-methods';
import { cn } from '@/lib/utils';

type Mode = 'edit' | 'preview' | 'contract';

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
  existingContract = null,
  senderName = null,
  initialExpiresAt = null,
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
  /** The live contract issued when this agreement was signed and sent —
   *  linked from the sent/signed banners. */
  existingContract?: {
    id: string;
    projectId: string | null;
    status: string;
    firstViewedAt?: string | null;
    lastViewedAt?: string | null;
    viewCount?: number;
    /** Newest first — the client's notes on the version that's out. */
    changeRequests?: { id: string; message: string; createdAt: string }[];
  } | null;
  /** The signed-in admin's name on file — prefills the Sign & send signature. */
  senderName?: string | null;
  /** When a sent agreement stops being open for signature. */
  initialExpiresAt?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  // Read status straight from the prop so a router.refresh() after Send
  // immediately flips the button visibility without a hard reload.
  const status = initialStatus;
  const revision = initialRevision;
  const isAccepted = status === 'accepted';
  const isSent = status === 'sent';
  const isExpired = status === 'expired';
  // Locked: accepted (permanent) or sent (until Revise & Resend unlocks it).
  const isLocked = isAccepted || isSent;
  // Force preview mode when locked.
  const [mode, setMode] = useState<Mode>(isLocked ? 'preview' : 'edit');
  const [title, setTitle] = useState(initialTitle);
  // Normalize on load: backfill the care_plan section for older proposals,
  // then pair each timeline phase with its payment milestone via a stable id
  // (and fill any blank milestone label from its phase name).
  const [content, setContent] = useState<ProposalContent>(() =>
    pairTimelineAndMilestones(withCarePlanDefaults(initialContent)),
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [signName, setSignName] = useState(senderName ?? '');
  const [signAgreed, setSignAgreed] = useState(false);
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);
  // What the server refused to send over (422) — shown as a list above the
  // form, since the toolbar's one-line error slot can't hold several.
  const [sendProblems, setSendProblems] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseBusy, setReviseBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);

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
      setSendProblems([]);
      const res = await fetch(`/api/admin/proposals/${proposalId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: signName.trim(),
          agreed: true,
          expires_in_days: expiryDays,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          problems?: string[];
        };
        if (j.problems && j.problems.length > 0) {
          setSendProblems(j.problems);
          setMode('edit');
          toast.error(
            "Can't send yet",
            j.problems.length === 1
              ? j.problems[0]
              : `${j.problems.length} things to fix — listed above the form.`,
          );
          return;
        }
        const msg = j.error ?? 'Failed to send.';
        setError(msg);
        toast.error("Couldn't send proposal", msg);
        return;
      }
      toast.success(
        'Signed & sent',
        `The client has ${expiryDays} days to review and sign.`,
      );
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

  async function reject() {
    setRejectBusy(true);
    try {
      const res = await fetch(`/api/admin/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("Couldn't mark proposal declined", j.error ?? '');
        return;
      }
      toast.success('Proposal marked declined');
      router.refresh();
    } finally {
      setRejectBusy(false);
      setRejectOpen(false);
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
            className="font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:text-copper"
          >
            ← {backLabel}
          </Link>
          <span aria-hidden className="h-3 w-px bg-border" />
          <ProposalStatusPill status={status} />
          {initialSentAt ? (
            <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              Sent {formatDate(initialSentAt)}
            </span>
          ) : null}
          {initialAcceptedAt ? (
            <span className="font-mono text-[10px] uppercase tracking-meta text-success">
              Signed {formatDate(initialAcceptedAt)}
            </span>
          ) : null}
          <span aria-hidden className="h-3 w-px bg-border" />
          {saving ? (
            <span className="font-mono text-[10px] uppercase tracking-meta text-copper">
              Saving…
            </span>
          ) : savedAt ? (
            <span className="font-mono text-[10px] uppercase tracking-meta text-success">
              Saved {savedAt.toLocaleTimeString()}
            </span>
          ) : null}
          {error ? (
            <span className="font-mono text-[10px] uppercase tracking-meta text-danger">
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
                'px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta transition-colors disabled:cursor-not-allowed disabled:opacity-40',
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
                'border-l border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta transition-colors',
                mode === 'preview'
                  ? 'bg-copper-soft/60 text-copper'
                  : 'bg-surface text-ink-muted hover:text-ink',
              )}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={() => setMode('contract')}
              title="The Agreement exactly as this draft generates it"
              className={cn(
                'border-l border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta transition-colors',
                mode === 'contract'
                  ? 'bg-copper-soft/60 text-copper'
                  : 'bg-surface text-ink-muted hover:text-ink',
              )}
            >
              Contract
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
              {revision > 1 ? 'Sign & re-send' : 'Sign & send'}
            </Button>
          ) : null}
          {isSent || isExpired ? (
            <>
              {isSent ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setRejectOpen(true)}
                  disabled={rejectBusy}
                >
                  Mark declined
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                onClick={() => setReviseOpen(true)}
                disabled={reviseBusy}
              >
                Revise & resend
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {isAccepted ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-5 py-3 print:hidden">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-success">
              Signed by both parties
            </p>
            <p className="mt-0.5 font-sans text-xs text-ink-muted">
              Locked. Open the agreement for both signatures, the PDF, and its
              status.
            </p>
          </div>
          {existingContract ? (
            <Link
              href={
                existingContract.projectId
                  ? `/admin/projects/${existingContract.projectId}/contracts/${existingContract.id}`
                  : `/admin/contracts/${existingContract.id}`
              }
              className="shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
            >
              View agreement →
            </Link>
          ) : null}
        </div>
      ) : isSent ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-copper/30 bg-copper-soft/25 px-5 py-3 print:hidden">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
              Signed by you · waiting on the client ·{' '}
              {existingContract?.firstViewedAt
                ? `opened ${existingContract.viewCount ?? 1}× · last ${formatDateTime(existingContract.lastViewedAt ?? existingContract.firstViewedAt)}`
                : 'not opened yet'}
            </p>
            {existingContract?.changeRequests?.length ? (
              <div className="mt-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
                <p className="font-mono text-[10px] uppercase tracking-meta text-warning">
                  Changes requested · {formatDateTime(existingContract.changeRequests[0].createdAt)}
                  {existingContract.changeRequests.length > 1
                    ? ` · ${existingContract.changeRequests.length} notes`
                    : ''}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap font-sans text-sm text-ink">
                  {existingContract.changeRequests[0].message}
                </p>
              </div>
            ) : null}
            <p className="mt-0.5 font-sans text-xs text-ink-muted">
              {initialExpiresAt
                ? `Open for their signature until ${formatDate(initialExpiresAt)}. `
                : ''}
              Locked while they review. To change it, use{' '}
              <span className="text-ink">Revise &amp; resend</span> — the sent
              version is withdrawn, the client is told, and this unlocks as v
              {revision + 1}.
            </p>
          </div>
          {existingContract ? (
            <Link
              href={
                existingContract.projectId
                  ? `/admin/projects/${existingContract.projectId}/contracts/${existingContract.id}`
                  : `/admin/contracts/${existingContract.id}`
              }
              className="shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
            >
              View agreement →
            </Link>
          ) : null}
        </div>
      ) : isExpired ? (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-5 py-3 print:hidden">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-warning">
            Expired{initialExpiresAt ? ` ${formatDate(initialExpiresAt)}` : ''}
          </p>
          <p className="mt-0.5 font-sans text-xs text-ink-muted">
            The client didn&apos;t sign in time. Use{' '}
            <span className="text-ink">Revise &amp; resend</span> to update it
            and send a fresh one.
          </p>
        </div>
      ) : null}

      {mode === 'contract' ? (
        <AgreementPreview proposalId={proposalId} content={content} />
      ) : mode === 'preview' ? (
        // What the client sees above the terms on their agreement page.
        <div className="space-y-8">
          <header className="space-y-2">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
              Client view · Agreement v{isLocked ? content.agreement_version : CURRENT_AGREEMENT_VERSION}
            </p>
            <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
              {title}
            </h1>
          </header>
          {content.note_to_client?.trim() ? (
            <section className="rounded-2xl border border-copper/20 bg-copper-soft/20 p-6">
              <p className="whitespace-pre-wrap font-sans text-base leading-relaxed text-ink">
                {content.note_to_client}
              </p>
            </section>
          ) : null}
          <AgreementSummary content={content} />
          <p className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle print:hidden">
            The full agreement follows on their page — see the Contract tab.
          </p>
        </div>
      ) : (
        <>
          {sendProblems.length > 0 ? (
            <div
              role="alert"
              className="rounded-xl border border-warning/30 bg-warning/5 px-5 py-4"
            >
              <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-warning">
                Fix these before sending
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 font-sans text-sm text-ink">
                {sendProblems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <EditorForm
            title={title}
            setTitle={setTitle}
            content={content}
            setContent={setContent}
            patch={patch}
            patchScope={patchScope}
          />
        </>
      )}

      <ConfirmDialog
        open={sendOpen}
        tone="default"
        title="Sign & send this agreement?"
        description={
          <div className="space-y-4">
            <p>
              Saves your edits, signs the agreement on behalf of LuxWeb Studio
              LLC, and sends it to the client. They review it and sign once —
              then pay the deposit, if there is one. Check the{' '}
              <span className="font-mono text-ink">Contract</span> tab first:
              that&apos;s exactly what you&apos;re signing.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="send-sign-name">Your full name</Label>
              <Input
                id="send-sign-name"
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                placeholder={senderName ?? 'As it appears on your profile'}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="send-expiry">Open for signature</Label>
              <select
                id="send-expiry"
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 font-sans text-sm text-ink focus:border-copper focus:outline-none"
              >
                {[7, 14, 30].map((d) => (
                  <option key={d} value={d}>
                    {d} days{d === DEFAULT_EXPIRY_DAYS ? ' (standard)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-start gap-2 text-ink">
              <input
                type="checkbox"
                checked={signAgreed}
                onChange={(e) => setSignAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-copper"
              />
              <span className="text-sm">
                I&apos;ve reviewed the agreement and sign it on behalf of LuxWeb
                Studio LLC.
              </span>
            </label>
          </div>
        }
        confirmLabel="Sign & send"
        busy={sendBusy}
        confirmDisabled={!signAgreed || signName.trim().length < 2}
        onCancel={() => (sendBusy ? undefined : setSendOpen(false))}
        onConfirm={send}
      />

      <ConfirmDialog
        open={deleteOpen}
        tone="danger"
        title="Delete agreement draft"
        description={
          <>
            <span className="font-mono text-ink">{title}</span> will be
            permanently removed from this project. The audit log retains the
            record.
          </>
        }
        confirmLabel="Delete draft"
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
            Withdraws the version you sent — its link stops working
            {isSent ? ' and the client is emailed that an update is coming' : ''}{' '}
            — and unlocks the agreement as{' '}
            <span className="font-mono text-ink">v{revision + 1}</span>. What
            they were sent (v{revision}) is kept in the audit log. When
            you&apos;re done, <span className="text-ink">Sign &amp; re-send</span>.
          </>
        }
        confirmLabel="Unlock for editing"
        busy={reviseBusy}
        onCancel={() => (reviseBusy ? undefined : setReviseOpen(false))}
        onConfirm={revise}
      />

      <ConfirmDialog
        open={rejectOpen}
        tone="danger"
        title="Mark agreement declined?"
        description={
          <>
            The agreement moves to <span className="font-mono text-ink">Declined</span>{' '}
            and the version you sent is withdrawn — the client can no longer
            sign it. The record stays in the audit log.
          </>
        }
        confirmLabel="Mark declined"
        busy={rejectBusy}
        onCancel={() => (rejectBusy ? undefined : setRejectOpen(false))}
        onConfirm={reject}
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
  const party = clientParty(content);
  function setParty(next: Partial<ClientParty>) {
    setContent((c) => ({
      ...c,
      client: { ...c.client, party: { ...clientParty(c), ...next } },
    }));
  }

  // Older drafts carry a sales pitch; new agreements don't. Only show those
  // editors when there's something in them to edit or clear.
  const hasLegacyPitch =
    Boolean(content.executive_summary?.trim()) ||
    content.project_goals.length > 0 ||
    content.why_luxweb.length > 0 ||
    content.next_steps.length > 0;

  // Adding a phase also seeds its payment milestone, linked by a stable id.
  // Removing a phase removes its milestone too. On a phase plan every phase
  // keeps its payment row (set it to $0 to not bill it); a legacy plan's
  // rows can still be pruned on their own in Investment.
  function addPhase() {
    setContent((c) => {
      const id = makePhaseId();
      const row = isPhasePlan(c)
        ? { kind: 'phase' as const, label: '', percent: 0, amount_cents: 0, due: 'On approval', phase_id: id }
        : { label: '', percent: 0, amount_cents: 0, due: '', phase_id: id };
      return {
        ...c,
        timeline: {
          ...c.timeline,
          phases: [...c.timeline.phases, { id, name: '', weeks: '', items: [] }],
        },
        investment: {
          ...c.investment,
          milestones: [...c.investment.milestones, row],
        },
      };
    });
  }

  function removePhase(index: number) {
    setContent((c) => {
      const phaseId = c.timeline.phases[index]?.id;
      return {
        ...c,
        timeline: {
          ...c.timeline,
          phases: c.timeline.phases.filter((_, i) => i !== index),
        },
        investment: {
          ...c.investment,
          milestones: c.investment.milestones.filter(
            (m) => m.phase_id !== phaseId,
          ),
        },
      };
    });
  }

  return (
    <div className="space-y-12">
      {/* Agreement details */}
      <FormSection title="Agreement details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" span={2}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Signature site build"
            />
          </Field>
          <Field label="Client signs as" span={2}>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {(['individual', 'business'] as const).map((kind, i) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setParty({ kind })}
                  aria-pressed={party.kind === kind}
                  className={cn(
                    'px-3 py-1.5 font-mono text-[10px] uppercase tracking-meta transition-colors',
                    i > 0 && 'border-l border-border',
                    party.kind === kind
                      ? 'bg-copper-soft/60 text-copper'
                      : 'bg-surface text-ink-muted hover:text-ink',
                  )}
                >
                  {kind === 'individual' ? 'Themselves' : 'A business'}
                </button>
              ))}
            </div>
          </Field>
          {party.kind === 'business' ? (
            <>
              <Field label="Business legal name">
                <Input
                  value={party.business_name ?? ''}
                  onChange={(e) => setParty({ business_name: e.target.value })}
                  placeholder="Aurora Dental LLC"
                />
              </Field>
              <Field
                label="Business description"
                hint="Optional — how the business is described in the parties block"
              >
                <Input
                  value={party.business_description ?? ''}
                  onChange={(e) =>
                    setParty({ business_description: e.target.value })
                  }
                  placeholder="a Georgia limited liability company"
                />
              </Field>
            </>
          ) : null}
          <Field
            label="Signer's full name"
            hint="Must match the contact's name on file — it's what they type to sign"
          >
            <Input
              value={content.client.name}
              onChange={(e) =>
                patch('client', { ...content.client, name: e.target.value })
              }
            />
          </Field>
          {party.kind === 'business' ? (
            <Field label="Signer's title">
              <Input
                value={party.signer_title ?? ''}
                onChange={(e) => setParty({ signer_title: e.target.value })}
                placeholder="Owner"
              />
            </Field>
          ) : null}
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
          <Field
            label="Agreement version"
            hint="Pinned to the current agreement when you send"
          >
            <p className="flex h-10 items-center font-mono text-sm text-ink-muted">
              v{CURRENT_AGREEMENT_VERSION}
            </p>
          </Field>
        </div>
      </FormSection>

      {/* Note to client */}
      <FormSection
        title="Note to client"
        description="Optional. A personal line shown above the agreement — it isn't part of the contract."
      >
        <TextArea
          rows={3}
          value={content.note_to_client ?? ''}
          onChange={(v) => patch('note_to_client', v)}
          placeholder="Great talking through the booking flow on Tuesday — here's everything we covered."
        />
      </FormSection>

      {/* Scope */}
      <FormSection title="Scope">
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
          <Field
            label="Site-specific deliverables"
            span={2}
            hint="One per line — what this client asked for on their site"
          >
            <LineArea
              rows={4}
              value={content.scope.site_deliverables ?? []}
              onChange={(lines) => patchScope('site_deliverables', lines)}
              placeholder={
                'Online booking with deposit\nStaff bios page\nGallery of past work\nMenu with PDF download'
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

      {/* Out of scope */}
      <FormSection
        title="Out of scope"
        description="Things this engagement doesn't cover. One per line — printed word for word in the Agreement (§ 1.3), which always adds the ADA / WCAG exclusion."
      >
        <LineArea
          rows={4}
          value={content.out_of_scope}
          onChange={(lines) => patch('out_of_scope', lines)}
          placeholder={'Ongoing content production\nPaid ads management'}
        />
      </FormSection>

      {/* Timeline */}
      <FormSection
        title="Timeline"
        description={
          isPhasePlan(content)
            ? 'Each phase is a milestone the client approves, with its own payment (which can be $0). Add or remove phases here; set the amounts in Investment below.'
            : "Each phase seeds a payment milestone named after it. Add or remove phases here; set the amounts — and remove any phase you don't bill for — in the Investment section below."
        }
      >
        <div className="space-y-5">
          {content.timeline.phases.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-surface px-4 py-3 font-sans text-sm text-ink-muted">
              No phases yet — add your first phase below.
            </p>
          ) : null}
          {content.timeline.phases.map((phase, i) => {
            const linked = content.investment.milestones.find(
              (m) => m.phase_id === phase.id,
            );
            const setPhase = (next: Partial<TimelinePhase>) =>
              setContent((c) => {
                const phases = c.timeline.phases.map((p, j) =>
                  j === i ? { ...p, ...next } : p,
                );
                // Keep the paired milestone's label following the phase name.
                const milestones =
                  'name' in next
                    ? c.investment.milestones.map((m) =>
                        m.phase_id === phase.id
                          ? { ...m, label: next.name ?? m.label }
                          : m,
                      )
                    : c.investment.milestones;
                return {
                  ...c,
                  timeline: { ...c.timeline, phases },
                  investment: { ...c.investment, milestones },
                };
              });
            return (
              <Card key={i} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-meta text-copper">
                    Phase {i + 1}
                    {!linked ? (
                      <span className="text-ink-subtle"> · no payment milestone</span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    onClick={() => removePhase(i)}
                    aria-label="Remove phase"
                    className="-mt-1 shrink-0 rounded-md border border-border bg-surface p-1.5 text-ink-muted transition-colors hover:border-danger/40 hover:text-danger"
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
                <div className="mt-4 space-y-4">
                  <Field label="Phase name">
                    <Input
                      value={phase.name}
                      placeholder="e.g., Discovery & Design"
                      onChange={(e) => setPhase({ name: e.target.value })}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                    <Field label="Weeks">
                      <Input
                        value={phase.weeks}
                        onChange={(e) => setPhase({ weeks: e.target.value })}
                      />
                    </Field>
                    <Field label="Items" hint="One per line">
                      <LineArea
                        rows={3}
                        value={phase.items}
                        onChange={(lines) => setPhase({ items: lines })}
                      />
                    </Field>
                  </div>
                </div>
              </Card>
            );
          })}
          <button
            type="button"
            onClick={addPhase}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-meta text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
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
            Add phase
          </button>
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

      {/* Investment */}
      <FormSection title="Investment">
        <InvestmentSection content={content} setContent={setContent} />
      </FormSection>

      {/* Recommended care plan */}
      <FormSection
        title="Recommended care plan"
        description="An optional ongoing-care recommendation shown after Investment. Turn it off to hide the section from this proposal."
      >
        <CarePlanSection content={content} setContent={setContent} />
      </FormSection>

      {/* Assumptions */}
      <FormSection
        title="Assumptions"
        description="What the price and schedule depend on. One per line — printed in the Agreement under Client Responsibilities (§ 5)."
      >
        <LineArea
          rows={3}
          value={content.assumptions}
          onChange={(lines) => patch('assumptions', lines)}
        />
      </FormSection>

      {/* Legacy sales sections — older drafts only */}
      {hasLegacyPitch ? (
        <FormSection
          title="Proposal pitch (older draft)"
          description="Agreements no longer carry a sales pitch, and clients don't see it — this older draft still has one. Clear it to tidy up; none of it is part of the contract."
        >
          <div className="space-y-6">
            <Field label="Executive summary">
              <TextArea
                rows={4}
                value={content.executive_summary}
                onChange={(v) => patch('executive_summary', v)}
              />
            </Field>
            <Field label="Project goals">
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
            </Field>
            <Field label="Why LuxWeb">
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
            </Field>
            <Field label="Next steps" hint="One per line">
              <LineArea
                rows={3}
                value={content.next_steps}
                onChange={(lines) => patch('next_steps', lines)}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setContent((c) => ({
                  ...c,
                  executive_summary: '',
                  project_goals: [],
                  why_luxweb: [],
                  next_steps: [],
                }))
              }
            >
              Clear the pitch
            </Button>
          </div>
        </FormSection>
      ) : null}
    </div>
  );
}

/* ----------------------------- tiny helpers ----------------------------- */

/** Today as YYYY-MM-DD in the studio's timezone — what a date input wants. */
function todayInStudioTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Unique id for a freshly added phase ↔ milestone pair. Runs only in a
// click handler (client), so crypto.randomUUID is available; the fallback
// keeps it working in any odd environment.
function makePhaseId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

  /**
   * Flag a milestone as already paid outside the portal. Signing skips
   * raising an invoice for it, so the client isn't billed for money they've
   * already handed over.
   */
  function setMilestoneCollected(index: number, collected: boolean) {
    setContent((c) => ({
      ...c,
      investment: {
        ...c.investment,
        milestones: c.investment.milestones.map((m, i) =>
          i === index
            ? collected
              ? {
                  ...m,
                  collected,
                  // Prefill so the common case (paid today, or just now
                  // remembered) is one click; edit the date if it was earlier.
                  collected_on: m.collected_on ?? todayInStudioTz(),
                  collected_method:
                    m.collected_method ?? OFFLINE_PAYMENT_METHODS[0],
                }
              : {
                  ...m,
                  collected,
                  collected_on: undefined,
                  collected_method: undefined,
                }
            : m,
        ),
      },
    }));
  }

  function setMilestoneCollectedDetail(
    index: number,
    key: 'collected_on' | 'collected_method',
    value: string,
  ) {
    setContent((c) => ({
      ...c,
      investment: {
        ...c.investment,
        milestones: c.investment.milestones.map((m, i) =>
          i === index ? { ...m, [key]: value } : m,
        ),
      },
    }));
  }

  const phasePlan = isPhasePlan(content);
  const hasDeposit = content.investment.milestones.some((m) => m.kind === 'deposit');

  // Phase plan: the deposit is optional and sits first. Adding one starts
  // it at $0 for the admin to set; the phase amounts aren't touched.
  function addDeposit() {
    setContent((c) => ({
      ...c,
      investment: {
        ...c.investment,
        milestones: [
          { kind: 'deposit', label: 'Deposit', percent: 0, amount_cents: 0, due: 'On signing' },
          ...c.investment.milestones,
        ],
      },
    }));
  }

  function setHourlyRateCents(cents: number) {
    setContent((c) => ({
      ...c,
      investment: { ...c.investment, hourly_rate_cents: cents },
    }));
  }

  // Legacy plans: milestones were seeded one per phase and can be pruned
  // here independently — removing one leaves its phase unpaid. Phase plans
  // only remove the deposit this way; a phase's row goes with its phase.
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
      <div className="grid gap-4 sm:grid-cols-4">
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
        <Field label="Hourly rate" hint="Out-of-scope and post-support work (§ 1.2)">
          <CurrencyInput
            cents={hourlyRateCents(content)}
            onCommit={setHourlyRateCents}
          />
        </Field>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
              Payment milestones
            </p>
            {phasePlan ? (
              <p className="mt-1 font-sans text-xs text-ink-subtle">
                The deposit is billed when the client signs. Each phase is
                billed when the client approves its work — set a phase to $0
                to not bill it. Tick{' '}
                <span className="text-ink-muted">Collected</span> on anything
                the client already paid — signing records it as paid instead
                of invoicing for it.
              </p>
            ) : (
              <p className="mt-1 font-sans text-xs text-ink-subtle">
                Seeded one per timeline phase and named after it. Remove any
                phase you don&apos;t bill for; the phase stays in the timeline.
                Tick <span className="text-ink-muted">Collected</span> on
                anything the client already paid — signing records it as paid
                instead of invoicing for it.
              </p>
            )}
          </div>
          {phasePlan && !hasDeposit ? (
            <Button type="button" variant="ghost" size="sm" onClick={addDeposit}>
              Add deposit
            </Button>
          ) : null}
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
          {ms.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-surface px-4 py-3 font-sans text-sm text-ink-muted">
              No payment milestones — add a phase in the Timeline section, or
              you&apos;ve removed them all.
            </p>
          ) : null}
          {ms.map((m, i) => (
            <div
              key={i}
              className="grid items-center gap-3 sm:grid-cols-[1fr_90px_140px_1fr_auto_auto]"
            >
              <div className="flex items-center gap-2">
                {phasePlan ? (
                  <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-meta text-copper">
                    {m.kind === 'deposit'
                      ? 'Deposit'
                      : `Phase ${content.timeline.phases.findIndex((p) => p.id === m.phase_id) + 1}`}
                  </span>
                ) : null}
                <Input
                  value={m.label}
                  placeholder="Label"
                  onChange={(e) => setMilestoneField(i, 'label', e.target.value)}
                />
              </div>
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
              <label
                className="flex items-center gap-2 whitespace-nowrap"
                title="Already paid outside the portal — signing won't invoice for it"
              >
                <input
                  type="checkbox"
                  checked={m.collected === true}
                  onChange={(e) => setMilestoneCollected(i, e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
                />
                <span className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">
                  Collected
                </span>
              </label>
              {!phasePlan || m.kind === 'deposit' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMilestone(i)}
                  aria-label={m.kind === 'deposit' ? 'Remove deposit' : 'Remove milestone'}
                >
                  ×
                </Button>
              ) : (
                // Keeps the grid aligned; a phase's row is removed with its phase.
                <span aria-hidden className="w-9" />
              )}
              {m.collected ? (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-success/20 bg-success/5 px-3 py-2 sm:col-span-6">
                  <span className="font-mono text-[10px] uppercase tracking-meta text-success">
                    Received
                  </span>
                  <Input
                    type="date"
                    aria-label={`Date ${m.label || 'milestone'} was received`}
                    value={m.collected_on ?? ''}
                    onChange={(e) =>
                      setMilestoneCollectedDetail(i, 'collected_on', e.target.value)
                    }
                    className="h-8 w-auto"
                  />
                  <select
                    aria-label={`How ${m.label || 'milestone'} was paid`}
                    value={m.collected_method ?? OFFLINE_PAYMENT_METHODS[0]}
                    onChange={(e) =>
                      setMilestoneCollectedDetail(i, 'collected_method', e.target.value)
                    }
                    className="h-8 rounded-md border border-border bg-surface px-2 font-sans text-sm text-ink focus:border-copper focus:outline-none"
                  >
                    {OFFLINE_PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                  <span className="font-sans text-xs text-ink-subtle">
                    Recorded as a paid invoice on signing — no invoice is sent.
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          {ms.length > 0 ? (
            <p
              className={cn(
                'font-mono text-[10px] uppercase tracking-meta',
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

function CarePlanSection({
  content,
  setContent,
}: {
  content: ProposalContent;
  setContent: (updater: (c: ProposalContent) => ProposalContent) => void;
}) {
  const cp = content.care_plan;

  function setCarePlan(next: Partial<ProposalCarePlan>) {
    setContent((c) => ({ ...c, care_plan: { ...c.care_plan, ...next } }));
  }

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={cp.recommended}
          onChange={(e) => {
            const on = e.target.checked;
            // Toggling on a blank/legacy section re-seeds the standard plan
            // so the admin isn't staring at empty fields.
            if (on && !cp.name && !cp.price_cents) {
              setCarePlan({ ...DEFAULT_CARE_PLAN, recommended: true });
            } else {
              setCarePlan({ recommended: on });
            }
          }}
          className="h-4 w-4 rounded border-border accent-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
        />
        <span className="font-sans text-sm text-ink">
          Recommend a care plan in this proposal
        </span>
      </label>

      {cp.recommended ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px_120px]">
            <Field label="Plan name">
              <Input
                value={cp.name}
                placeholder="LuxWeb Care Plan"
                onChange={(e) => setCarePlan({ name: e.target.value })}
              />
            </Field>
            <Field label="Price (USD)">
              <CurrencyInput
                cents={cp.price_cents}
                onCommit={(price_cents) => setCarePlan({ price_cents })}
              />
            </Field>
            <Field label="Billed">
              <select
                value={cp.interval}
                onChange={(e) =>
                  setCarePlan({
                    interval: e.target.value as ProposalCarePlan['interval'],
                  })
                }
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 font-sans text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
              >
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </Field>
          </div>
          <Field label="Description">
            <TextArea
              rows={2}
              value={cp.description}
              onChange={(v) => setCarePlan({ description: v })}
              placeholder="What the plan covers, in a sentence or two."
            />
          </Field>
          <Field label="What's included" hint="One per line">
            <LineArea
              rows={4}
              value={cp.features}
              onChange={(features) => setCarePlan({ features })}
            />
          </Field>
        </div>
      ) : (
        <p className="font-sans text-xs text-ink-subtle">
          The care-plan section is hidden from this proposal.
        </p>
      )}
    </div>
  );
}

// Edit-mode form groups. Preview keeps the numbered 01–N document structure;
// the editor used to mirror that, but identical numbering across Edit/Preview
// (with different content) was disorienting. The form is just groups now.
/**
 * The Agreement exactly as this draft generates it — rendered server-side
 * from the editor's current (unsaved) content against the template Send
 * will pin. Mounted fresh each time the Contract tab opens, and the draft
 * can't change while it's showing, so one fetch per open is enough.
 */
function AgreementPreview({
  proposalId,
  content,
}: {
  proposalId: string;
  content: ProposalContent;
}) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; body: string; version: string }
    | { status: 'error'; message: string }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/proposals/${proposalId}/agreement-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_json: content }),
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as {
          body_md?: string;
          version?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !j.body_md) {
          setState({ status: 'error', message: j.error ?? 'Could not render the agreement.' });
        } else {
          setState({ status: 'ready', body: j.body_md, version: j.version ?? '' });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', message: 'Could not render the agreement.' });
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId, content]);

  if (state.status === 'loading') {
    return (
      <p className="py-16 text-center font-mono text-[10px] uppercase tracking-meta text-ink-muted">
        Rendering agreement…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="py-16 text-center font-sans text-sm text-danger">
        {state.message}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-meta text-ink-muted print:hidden">
        Agreement v{state.version} · generated from this draft · signatures are
        added when it&apos;s signed
      </p>
      <article className="rounded-2xl border border-border bg-surface p-8 md:p-10 print-plain">
        <ContractBody body={state.body} />
      </article>
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="font-display text-lg font-medium tracking-tight text-ink">
          {title}
        </h3>
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
        <Card
          key={i}
          padding="sm"
          className="flex items-start gap-3"
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
        </Card>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, newItem()])}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-meta text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
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
