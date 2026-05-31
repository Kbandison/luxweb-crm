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

    const sb = supabaseAdmin();

    // A resend just means an auth user already exists for this contact, so we
    // send a magic link rather than a fresh invite. We deliberately DON'T
    // block on a user looking "accepted": email_confirmed_at / last_sign_in_at
    // get set the moment any magic link is consumed — including by a
    // link-scanning mail server or a click that never reached the password
    // step — so they're false signals for "finished setup" and were wrongly
    // returning "already has portal access". Re-sending an access link is
    // harmless: for an existing user it's just a login link.
    let isResend = Boolean(contact.user_id);

    // Build the redirect URL. Falls back to localhost when dev.
    const origin =
      req.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000';

    const genLink = (type: 'invite' | 'magiclink') =>
      sb.auth.admin.generateLink({
        type,
        email: contact.email as string,
        options: {
          data: { full_name: contact.full_name ?? '' },
          redirectTo: `${origin}/accept-invite`,
        },
      });

    // First-time invites use generateLink('invite') so the handle_new_user
    // trigger provisions + links the auth user. A resend can't use 'invite'
    // (it 422s once the user exists) — it uses a magic link, which any
    // existing user can consume to finish setup.
    //
    // We can also reach here thinking it's a first invite (contact.user_id is
    // null) when the auth user actually exists — e.g. the trigger never linked
    // it back. Then the 'invite' call 422s "already registered"; fall back to
    // a magic link and self-heal the link below.
    let { data, error } = await genLink(isResend ? 'magiclink' : 'invite');
    if (
      error &&
      !isResend &&
      /already|exists|registered/i.test(error.message ?? '')
    ) {
      isResend = true;
      ({ data, error } = await genLink('magiclink'));
    }

    if (error || !data?.properties?.action_link || !data?.user?.id) {
      return Response.json(
        { error: error?.message ?? 'Failed to generate invite link' },
        { status: 500 },
      );
    }

    const inviteUrl = data.properties.action_link;
    const newUserId = data.user.id;

    // Self-heal: if the contact wasn't linked to its auth user (the
    // handle_new_user trigger didn't fire), set it now so future resends
    // detect the pending invite directly instead of 422-ing on 'invite'.
    if (!contact.user_id) {
      await sb
        .from('contacts')
        .update({ user_id: newUserId })
        .eq('id', contact.id as string);
    }

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
        resend: isResend,
      },
    });

    return Response.json({ ok: true, user_id: newUserId, resend: isResend });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/contacts/[id]/invite', err);
  }
}
