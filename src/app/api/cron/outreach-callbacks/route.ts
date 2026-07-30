import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/resend';
import { resolveSetterNames } from '@/lib/queries/outreach';
import CallbackReminderEmail, {
  callbackReminderSubject,
} from '@/emails/callback-reminder-email';

export const runtime = 'nodejs';

/**
 * Cron: each morning, email every setter the callbacks they promised.
 *
 * A scheduled callback used to exist only as a sort key on the queue — nothing
 * told anyone it had come due. Scheduled daily via vercel.json and protected
 * by CRON_SECRET, same as the proposal expiry job.
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
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Everything still workable with a callback due by end of day.
  const { data, error } = await sb
    .from('prospects')
    .select('id, owner_id, full_name, company, next_action_at, status')
    .not('next_action_at', 'is', null)
    .lte('next_action_at', endOfDay.toISOString())
    // 'unreachable' is dropped in JS below — naming an enum label that may not
    // exist yet would error the whole query.
    .not('status', 'in', '(converted,not_interested,bad_number,dnc)')
    .order('next_action_at', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as {
    id: string;
    owner_id: string | null;
    full_name: string;
    company: string | null;
    next_action_at: string;
    status: string;
  }[]).filter((r) => r.status !== 'unreachable');

  const bySetter = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.owner_id) continue;
    const list = bySetter.get(r.owner_id) ?? [];
    list.push(r);
    bySetter.set(r.owner_id, list);
  }
  if (bySetter.size === 0) return Response.json({ ok: true, sent: 0 });

  const setterIds = [...bySetter.keys()];
  const [{ data: users }, names] = await Promise.all([
    sb.from('users').select('id, email').in('id', setterIds),
    resolveSetterNames(setterIds),
  ]);
  const emailById = new Map(
    ((users ?? []) as { id: string; email: string }[]).map((u) => [u.id, u.email]),
  );

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  let sent = 0;
  const failed: string[] = [];

  for (const [setterId, list] of bySetter) {
    const to = emailById.get(setterId);
    if (!to) continue;
    const overdue = list.filter((r) => new Date(r.next_action_at) <= now).length;
    const props = {
      recipientName: names.get(setterId) ?? 'there',
      overdue,
      today: list.length - overdue,
      samples: list.slice(0, 5).map((r) => ({
        name: r.company || r.full_name,
        when: new Date(r.next_action_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
      })),
      dialUrl: `${base}/outreach/dial`,
    };
    try {
      await sendEmail({
        to,
        subject: callbackReminderSubject(props),
        react: CallbackReminderEmail(props),
        tag: 'callback_reminder',
        category: 'admin',
      });
      sent += 1;
    } catch {
      // One bad address shouldn't stop the rest of the run.
      failed.push(setterId);
    }
  }

  return Response.json({ ok: true, sent, failed: failed.length });
}
