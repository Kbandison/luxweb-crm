import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserIds } from '@/lib/notifications';

/**
 * Promote a qualified prospect into the real pipeline: create a contact +
 * deal (owned by the setter) and notify the owner. Idempotent — a prospect
 * already linked to a contact (converted_contact_id) is skipped. Best-effort:
 * never throws, so it can't break the call-logging that triggers it.
 */
export async function promoteProspectToLead(
  prospectId: string,
  actorId: string | null,
): Promise<string | null> {
  try {
    const sb = supabaseAdmin();
    const { data: p } = await sb
      .from('prospects')
      .select(
        'id, owner_id, full_name, company, phone, email, source, website_problem, notes, converted_contact_id',
      )
      .eq('id', prospectId)
      .maybeSingle();
    if (!p || (p as { converted_contact_id: string | null }).converted_contact_id) {
      return null;
    }
    const pr = p as {
      owner_id: string | null;
      full_name: string;
      company: string | null;
      phone: string | null;
      email: string | null;
      source: string | null;
      website_problem: string | null;
      notes: string | null;
    };

    const { data: contact } = await sb
      .from('contacts')
      .insert({
        full_name: pr.full_name,
        company: pr.company,
        phone: pr.phone,
        email: pr.email,
        source: pr.source ?? 'outreach',
        tags: ['outreach'],
        owner_id: pr.owner_id,
      })
      .select('id')
      .single();
    if (!contact) return null;
    const contactId = (contact as { id: string }).id;

    const title = `${pr.company ?? pr.full_name} — booked via outreach`;
    await sb
      .from('deals')
      .insert({ contact_id: contactId, title, owner_id: pr.owner_id });

    await sb
      .from('prospects')
      .update({ converted_contact_id: contactId })
      .eq('id', prospectId);

    await writeAudit({
      actor_id: actorId,
      action: 'create',
      entity_type: 'contact',
      entity_id: contactId,
      diff: { from: 'prospect', prospect_id: prospectId },
    });

    const message = pr.website_problem ?? pr.notes ?? null;
    const adminIds = await getAdminUserIds();
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          type: 'new_lead',
          userId,
          contactId,
          fullName: pr.full_name,
          email: pr.email,
          company: pr.company,
          source: pr.source ?? 'outreach',
          message,
          leadPath: `/admin/leads?lead=${contactId}`,
        }),
      ),
    );

    return contactId;
  } catch (err) {
    console.warn('[promoteProspectToLead] failed:', err);
    return null;
  }
}
