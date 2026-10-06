import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import { flattenJoin } from '@/lib/array-join';
import {
  REMINDER_COLUMN,
  reminderDue,
  type ReminderKind,
} from '@/lib/agreements/reminders';

export const runtime = 'nodejs';

/**
 * Cron: nudge clients about agreements waiting on their signature — once
 * unopened after 3 days, once unsigned after 7, once 2 days before expiry
 * (rules in lib/agreements/reminders.ts). Scheduled daily via vercel.json.
 *
 * Each reminder is claimed on the contract before it's sent, so a double
 * run can't send it twice. Protected by CRON_SECRET (fails closed).
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('contracts')
    .select(
      `id, contact_id, admin_signed_at, first_viewed_at,
       reminded_unopened_at, reminded_unsigned_at, reminded_expiring_at,
       proposals!inner(title, status, sent_at, expires_at)`,
    )
    .eq('status', 'pending_client_signature');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    contact_id: string;
    admin_signed_at: string | null;
    first_viewed_at: string | null;
    reminded_unopened_at: string | null;
    reminded_unsigned_at: string | null;
    reminded_expiring_at: string | null;
    proposals:
      | { title: string; status: string; sent_at: string | null; expires_at: string | null }
      | { title: string; status: string; sent_at: string | null; expires_at: string | null }[];
  };
  const now = new Date();
  const sent: { contractId: string; kind: ReminderKind }[] = [];

  for (const row of (data ?? []) as unknown as Row[]) {
    const proposal = flattenJoin(row.proposals);
    const sentAt = proposal?.sent_at ?? row.admin_signed_at;
    if (!proposal || proposal.status !== 'sent' || !sentAt) continue;

    const kind = reminderDue(
      {
        sentAt,
        expiresAt: proposal.expires_at,
        firstViewedAt: row.first_viewed_at,
        remindedUnopenedAt: row.reminded_unopened_at,
        remindedUnsignedAt: row.reminded_unsigned_at,
        remindedExpiringAt: row.reminded_expiring_at,
      },
      now,
    );
    if (!kind) continue;

    // Claim it — only if it's still unsent and the contract still pending.
    const column = REMINDER_COLUMN[kind];
    const { data: claimed } = await sb
      .from('contracts')
      .update({ [column]: now.toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending_client_signature')
      .is(column, null)
      .select('id');
    if ((claimed ?? []).length === 0) continue;

    const userId = await getContactUserId(row.contact_id);
    if (userId) {
      await notify({
        type: 'agreement_reminder',
        userId,
        contractId: row.id,
        kind,
        title: proposal.title,
        expiresAt: proposal.expires_at,
        contractPath: `/portal/contracts/${row.id}`,
      });
    }
    await writeAudit({
      actor_id: null,
      action: 'remind',
      entity_type: 'contract',
      entity_id: row.id,
      diff: { kind, delivered: Boolean(userId), at: now.toISOString() },
    });
    sent.push({ contractId: row.id, kind });
  }

  return Response.json({ ok: true, reminded: sent.length, sent });
}
