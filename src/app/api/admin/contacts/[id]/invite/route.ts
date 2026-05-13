import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/contacts/[id]/invite
 *
 * Sends a branded portal invite. We use Supabase's `generateLink()` so the
 * auth user is provisioned (and the `handle_new_user` trigger links it
 * back to this contact by email) without sending Supabase's default
 * unbranded email. The action_link is then routed through `notify()` so
 * the InviteEmail template fires and an in-app row is created for the
 * new user.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const limit = limitByKey(`admin/contacts/[id]/invite:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const { data: contact } = await supabaseAdmin()
      .from('contacts')
      .select('id, email, full_name, user_id')
      .eq('id', id)
      .single();

    if (!contact) {
      return Response.json({ error: 'Contact not found' }, { status: 404 });
    }
    if (!contact.email) {
      return Response.json(
        { error: 'Contact has no email on file.' },
        { status: 400 },
      );
    }
    if (contact.user_id) {
      return Response.json(
        { error: 'This contact already has portal access.' },
        { status: 409 },
      );
    }

    // Build the redirect URL. Falls back to localhost when dev.
    const origin =
      req.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000';

    // generateLink({type:'invite'}) provisions the auth user (firing the
    // handle_new_user trigger that backfills crm.users + links the
    // contact) and returns the action_link without sending Supabase's
    // default email. We then send the branded email ourselves.
    const { data, error } = await supabaseAdmin().auth.admin.generateLink({
      type: 'invite',
      email: contact.email as string,
      options: {
        data: { full_name: contact.full_name ?? '' },
        redirectTo: `${origin}/accept-invite`,
      },
    });

    if (error || !data?.properties?.action_link || !data?.user?.id) {
      return Response.json(
        { error: error?.message ?? 'Failed to generate invite link' },
        { status: 500 },
      );
    }

    const inviteUrl = data.properties.action_link;
    const newUserId = data.user.id;

    // Branded email + in-app notification. notify() reads the user's
    // email_prefs but invite emails always go (see notify()).
    await notify({
      type: 'invite',
      userId: newUserId,
      email: contact.email as string,
      inviteUrl,
    });

    await writeAudit({
      actor_id: session.userId,
      action: 'send',
      entity_type: 'invite',
      entity_id: (contact.id as string) ?? undefined,
      diff: {
        email: contact.email,
        new_user_id: newUserId,
      },
    });

    return Response.json({ ok: true, user_id: newUserId });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/contacts/[id]/invite', err);
  }
}
