import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/contacts/[id]/invite
 *
 * Sends a Supabase Auth invite email. The handle_new_user trigger links
 * the new auth.users row back to this contact (contact.user_id ↔ user.id)
 * via email match. Resend override + branded template comes in Step 9.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
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

    const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(
      contact.email as string,
      {
        data: { full_name: contact.full_name ?? '' },
        redirectTo: `${origin}/accept-invite`,
      },
    );

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'send',
      entity_type: 'invite',
      entity_id: (contact.id as string) ?? undefined,
      diff: {
        email: contact.email,
        new_user_id: data?.user?.id ?? null,
      },
    });

    return Response.json({ ok: true, user_id: data?.user?.id ?? null });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: message }, { status: 500 });
  }
}
