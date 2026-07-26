'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import {
  ASSIGNABLE_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type Role,
} from '@/lib/auth/permissions';
import type { TeamMemberRow } from '@/lib/queries/team';

type Mode = 'create' | 'edit';

export type TeamMemberDrawerProps = {
  /** Present → edit that member; absent → create a new one. */
  member?: TeamMemberRow | null;
  /** Owner-only: whether the Owner role can be granted. */
  canAssignOwner: boolean;
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
  triggerClassName?: string;
};

const fieldDollars = (cents: number | null) =>
  cents == null ? '' : (cents / 100).toString();

export function TeamMemberDrawer({
  member,
  canAssignOwner,
  triggerLabel,
  triggerVariant = 'primary',
  triggerSize = 'sm',
  triggerClassName,
}: TeamMemberDrawerProps) {
  const mode: Mode = member ? 'edit' : 'create';
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(member?.fullName ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [title, setTitle] = useState(member?.title ?? '');
  const [role, setRole] = useState<Role>(member?.role ?? 'contractor');
  const [employmentType, setEmploymentType] = useState<
    'employee' | 'contractor'
  >(member?.employmentType ?? 'contractor');
  const [status, setStatus] = useState<'active' | 'inactive'>(
    member?.status ?? 'active',
  );
  const [rateType, setRateType] = useState<'hourly' | 'fixed'>(
    member?.rateType ?? 'hourly',
  );
  const [rate, setRate] = useState<string>(fieldDollars(member?.rateCents ?? null));

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // Owner role is only selectable by an owner. If a non-owner somehow has it
  // selected (shouldn't happen), the server rejects it too.
  const roleOptions = ASSIGNABLE_ROLES.filter(
    (r) => r !== 'admin' || canAssignOwner || member?.role === 'admin',
  );

  function resetToMember() {
    setFullName(member?.fullName ?? '');
    setEmail(member?.email ?? '');
    setPhone(member?.phone ?? '');
    setTitle(member?.title ?? '');
    setRole(member?.role ?? 'contractor');
    setEmploymentType(member?.employmentType ?? 'contractor');
    setStatus(member?.status ?? 'active');
    setRateType(member?.rateType ?? 'hourly');
    setRate(fieldDollars(member?.rateCents ?? null));
    setError(null);
  }

  function close() {
    setOpen(false);
    if (mode === 'create') resetToMember();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const trimmedRate = rate.trim();
      const rateCents =
        trimmedRate === '' ? null : Math.round(Number(trimmedRate) * 100);
      if (rateCents != null && (!Number.isFinite(rateCents) || rateCents < 0)) {
        setError('Rate must be a positive number.');
        setBusy(false);
        return;
      }

      const payload = {
        full_name: fullName,
        email: email.trim() || null,
        phone: phone.trim() || null,
        title: title.trim() || null,
        role,
        employment_type: employmentType,
        status,
        rate_cents: rateCents,
        rate_type: rateType,
      };

      const res = await fetch(
        mode === 'create' ? '/api/admin/team' : `/api/admin/team/${member!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error ?? 'Failed to save team member.';
        setError(msg);
        toast.error("Couldn't save", msg);
        setBusy(false);
        return;
      }

      setOpen(false);
      toast.success(
        mode === 'create' ? 'Team member added' : 'Team member updated',
        fullName,
      );
      router.refresh();
    } catch {
      const msg = 'Network error. Try again.';
      setError(msg);
      toast.error("Couldn't save", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
      >
        {triggerLabel ?? (mode === 'create' ? 'New team member' : 'Edit')}
      </Button>

      <Drawer
        open={open}
        onClose={close}
        side="right"
        width="md"
        labelledBy={headingId}
      >
        <header className="relative isolate overflow-hidden border-b border-border px-6 pb-5 pt-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-copper/20 via-gold/10 to-transparent blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px copper-rule"
          />
          <div className="relative">
            <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
              {mode === 'create' ? 'New team member' : 'Edit team member'}
            </p>
            <h2
              id={headingId}
              className="mt-1 font-display text-2xl font-medium tracking-tight text-ink"
            >
              {mode === 'create' ? 'Add to the team' : fullName}
            </h2>
          </div>
        </header>

        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="space-y-1.5">
              <Label htmlFor="tm_full_name">Full name</Label>
              <Input
                ref={firstFieldRef}
                id="tm_full_name"
                required
                maxLength={200}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alex Rivera"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tm_email">Email</Label>
                <Input
                  id="tm_email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@studio.com"
                />
                <p className="font-sans text-xs text-ink-subtle">
                  Required to invite them to their workspace.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tm_phone">Phone</Label>
                <Input
                  id="tm_phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 ..."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tm_title">Title</Label>
              <Input
                id="tm_title"
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Designer, Developer, PM…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tm_role">Access role</Label>
              <select
                id="tm_role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <p className="font-sans text-xs text-ink-subtle">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tm_employment">Type</Label>
                <select
                  id="tm_employment"
                  value={employmentType}
                  onChange={(e) =>
                    setEmploymentType(e.target.value as 'employee' | 'contractor')
                  }
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
                >
                  <option value="employee">Employee</option>
                  <option value="contractor">Contractor</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tm_status">Status</Label>
                <select
                  id="tm_status"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as 'active' | 'inactive')
                  }
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tm_rate">Pay rate (USD)</Label>
                <Input
                  id="tm_rate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="120.00"
                />
                <p className="font-sans text-xs text-ink-subtle">
                  Admin-only. Never shown to the team member.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tm_rate_type">Rate type</Label>
                <select
                  id="tm_rate_type"
                  value={rateType}
                  onChange={(e) =>
                    setRateType(e.target.value as 'hourly' | 'fixed')
                  }
                  className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30"
                >
                  <option value="hourly">Hourly</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
            </div>

            {error ? (
              <p role="alert" className="font-sans text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !fullName.trim()}>
              {busy
                ? 'Saving…'
                : mode === 'create'
                  ? 'Add member'
                  : 'Save changes'}
            </Button>
          </footer>
        </form>
      </Drawer>
    </>
  );
}
