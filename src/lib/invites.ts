import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import type { Role } from '@/lib/auth/permissions';

export type PortalInviteResult =
  | { ok: true; userId: string; resend: boolean }
  | { ok: false; status: number; error: string };

/**
 * Provision (or re-link) a contact's portal auth user and email them a branded
 * access link. Shared by the manual "Invite to portal" button and the
 * auto-invite that fires when a proposal is sent to a not-yet-invited client.
 *
 * Uses Supabase generateLink so the auth user is created (and the
 * handle_new_user trigger links it back by email) without Supabase's default
 * unbranded email. A first invite uses type 'invite'; once the auth user
 * exists a resend must use a magic link. The email links straight to
 * /accept-invite with the token_hash (not Supabase's action_link, which drops
 * the token on its redirect). Never throws — returns a result either way, so
 * an auto-invite can't break the action that triggered it.
 */
export async function sendPortalInvite(opts: {
  contactId: string;
  origin: string;
  actorId: string | null;
}): Promise<PortalInviteResult> {
  try {
    const sb = supabaseAdmin();
    const { data: contact } = await sb
      .from('contacts')
      .select('id, email, full_name, user_id')
      .eq('id', opts.contactId)
      .single();

    if (!contact) return { ok: false, status: 404, error: 'Contact not found' };
    if (!contact.email) {
      return { ok: false, status: 400, error: 'Contact has no email on file.' };
    }

    // A resend just means an auth user already exists for this contact. We
    // don't block on "looks accepted" — email_confirmed_at / last_sign_in_at
    // are set by any magic-link consumption (incl. mail-server scanners), so
    // they're false "finished setup" signals. Re-sending a link is harmless.
    let isResend = Boolean(contact.user_id);

    const genLink = (type: 'invite' | 'magiclink') =>
      sb.auth.admin.generateLink({
        type,
        email: contact.email as string,
        options: {
          data: { full_name: contact.full_name ?? '' },
          redirectTo: `${opts.origin}/accept-invite`,
        },
      });

    // If we think it's a first invite (user_id null) but the auth user already
    // exists — e.g. the trigger never linked it — 'invite' 422s "already
    // registered"; fall back to a magic link and self-heal the link below.
    let { data, error } = await genLink(isResend ? 'magiclink' : 'invite');
    if (
      error &&
      !isResend &&
      /already|exists|registered/i.test(error.message ?? '')
    ) {
      isResend = true;
      ({ data, error } = await genLink('magiclink'));
    }

    if (error || !data?.properties?.hashed_token || !data?.user?.id) {
      return {
        ok: false,
        status: 500,
        error: error?.message ?? 'Failed to generate invite link',
      };
    }

    const inviteType = isResend ? 'magiclink' : 'invite';
    const inviteUrl = `${opts.origin}/accept-invite?token_hash=${encodeURIComponent(
      data.properties.hashed_token,
    )}&type=${inviteType}`;
    const newUserId = data.user.id;

    // Self-heal the contact↔user link if the trigger didn't.
    if (!contact.user_id) {
      await sb
        .from('contacts')
        .update({ user_id: newUserId })
        .eq('id', contact.id as string);
    }

    await notify({
      type: 'invite',
      userId: newUserId,
      email: contact.email as string,
      inviteUrl,
    });

    await writeAudit({
      actor_id: opts.actorId,
      action: 'send',
      entity_type: 'invite',
      entity_id: contact.id as string,
      diff: { email: contact.email, new_user_id: newUserId, resend: isResend },
    });

    return { ok: true, userId: newUserId, resend: isResend };
  } catch (err) {
    console.warn('[sendPortalInvite] failed:', err);
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : 'Invite failed',
    };
  }
}

/**
 * Provision (or re-link) a team member's auth user, promote their crm.users
 * row to the access role assigned on the team_members record, and email a
 * branded staff invite. The team-member analogue of {@link sendPortalInvite}.
 *
 * The handle_new_user trigger creates the crm.users row defaulting to
 * 'client'; we immediately overwrite the role from team_members.role so the
 * member lands in the right area (proxy routes by role). Re-invites also
 * re-sync the role in case it changed since the first send. Never throws.
 */
export async function sendStaffInvite(opts: {
  teamMemberId: string;
  origin: string;
  actorId: string | null;
}): Promise<PortalInviteResult> {
  try {
    const sb = supabaseAdmin();
    const { data: member } = await sb
      .from('team_members')
      .select('id, email, full_name, user_id, role')
      .eq('id', opts.teamMemberId)
      .single();

    if (!member) return { ok: false, status: 404, error: 'Team member not found' };
    if (!member.email) {
      return { ok: false, status: 400, error: 'Team member has no email on file.' };
    }

    const memberRole = (member.role as Role) ?? 'contractor';
    let isResend = Boolean(member.user_id);

    const genLink = (type: 'invite' | 'magiclink') =>
      sb.auth.admin.generateLink({
        type,
        email: member.email as string,
        options: {
          data: { full_name: member.full_name ?? '' },
          redirectTo: `${opts.origin}/accept-invite`,
        },
      });

    let { data, error } = await genLink(isResend ? 'magiclink' : 'invite');
    if (
      error &&
      !isResend &&
      /already|exists|registered/i.test(error.message ?? '')
    ) {
      isResend = true;
      ({ data, error } = await genLink('magiclink'));
    }

    if (error || !data?.properties?.hashed_token || !data?.user?.id) {
      return {
        ok: false,
        status: 500,
        error: error?.message ?? 'Failed to generate invite link',
      };
    }

    const inviteType = isResend ? 'magiclink' : 'invite';
    const inviteUrl = `${opts.origin}/accept-invite?token_hash=${encodeURIComponent(
      data.properties.hashed_token,
    )}&type=${inviteType}`;
    const newUserId = data.user.id;

    // Link the team member to their auth user if not already.
    if (!member.user_id) {
      await sb
        .from('team_members')
        .update({ user_id: newUserId })
        .eq('id', member.id as string);
    }

    // Promote the crm.users row from the trigger's default 'client' to the
    // assigned access role (and re-sync on resend).
    await sb
      .from('users')
      .update({ role: memberRole })
      .eq('id', newUserId);

    await notify({
      type: 'invite',
      userId: newUserId,
      email: member.email as string,
      inviteUrl,
      audience: 'staff',
    });

    await writeAudit({
      actor_id: opts.actorId,
      action: 'send',
      entity_type: 'team_member_invite',
      entity_id: member.id as string,
      diff: { email: member.email, new_user_id: newUserId, role: memberRole, resend: isResend },
    });

    return { ok: true, userId: newUserId, resend: isResend };
  } catch (err) {
    console.warn('[sendStaffInvite] failed:', err);
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : 'Invite failed',
    };
  }
}
