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

    // If contact.user_id is already set, decide whether to treat this as
    // a re-send of a pending invite (auth user provisioned but never
    // accepted) or a 409 (active user with portal access). Without this
    // branch the route locks the admin out of resending a botched first
    // attempt — e.g., the React-render email failure from earlier.
    let isResend = false;
    if (contact.user_id) {
      const { data: authData } = await sb.auth.admin.getUserById(
        contact.user_id as string,
      );
      const authUser = authData?.user as
        | { email_confirmed_at?: string | null; last_sign_in_at?: string | null }
        | undefined;
      const accepted = Boolean(
        authUser?.email_confirmed_at || authUser?.last_sign_in_at,
      );
      if (accepted) {
        return Response.json(
          { error: 'This contact already has portal access.' },
          { status: 409 },
        );
      }
      isResend = true;
    }

    // Build the redirect URL. Falls back to localhost when dev.
    const origin =
      req.headers.get('origin') ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000';

    // For first-time invites we use generateLink({type:'invite'}) so the
    // handle_new_user trigger fires and links the contact. For a resend
    // (auth user already exists) generateLink('invite') would 422 with
    // "user already exists" — switch to magiclink, which any auth user
    // can consume to set up their session.
    const { data, error } = await sb.auth.admin.generateLink({
      type: isResend ? 'magiclink' : 'invite',
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
        resend: isResend,
      },
    });

    return Response.json({ ok: true, user_id: newUserId, resend: isResend });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/contacts/[id]/invite', err);
  }
}
