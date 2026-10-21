import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { isValidEmail } from '@/lib/validation/email';
import { matchExistingContact, type ContactKey } from '@/lib/outreach/contact-match';

/** Deal stages that still count as an open opportunity. */
const OPEN_DEAL_STAGES = ['lead', 'discovery', 'proposal'];

/**
 * Promote a qualified prospect into the real pipeline: create a contact +
 * deal (owned by the setter) and notify the owner. Idempotent — a prospect
 * already linked to a contact (converted_contact_id) is skipped. Best-effort:
 * never throws, so it can't break the call-logging that triggers it.
 *
 * A prospect who is already a contact (same email or phone — say they filled
 * in the website form first) is linked to that contact instead of
 * duplicated, and gets a new deal only if they have no open one.
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

    // The contact list is small; one scan matches the call list's dedupe.
    const { data: contacts } = await sb.from('contacts').select('id, email, phone');
    const existing = matchExistingContact(
      (contacts ?? []) as ContactKey[],
      pr.email,
      pr.phone,
    );

    let contactId: string;
    if (existing) {
      contactId = existing.id;
    } else {
      const { data: contact } = await sb
        .from('contacts')
        .insert({
          full_name: pr.full_name,
          company: pr.company,
          phone: pr.phone,
          // Contacts are held to stricter rules than prospects (the contact
          // edit form re-validates both): a malformed email or a source past
          // 80 chars would make the promoted lead unsaveable.
          email: pr.email && isValidEmail(pr.email.trim()) ? pr.email.trim() : null,
          source: (pr.source ?? 'outreach').slice(0, 80),
          tags: ['outreach'],
          owner_id: pr.owner_id,
        })
        .select('id')
        .single();
      if (!contact) return null;
      contactId = (contact as { id: string }).id;
    }

    // An existing contact may already have an opportunity open (a web
    // inquiry's 'lead' deal, say) — the booking belongs to that one.
    const { data: openDeal } = existing
      ? await sb
          .from('deals')
          .select('id')
          .eq('contact_id', contactId)
          .in('stage', OPEN_DEAL_STAGES)
          .limit(1)
          .maybeSingle()
      : { data: null };
    if (!openDeal) {
      const title = `${pr.company ?? pr.full_name} — booked via outreach`;
      await sb
        .from('deals')
        .insert({ contact_id: contactId, title, owner_id: pr.owner_id });
    }

    await sb
      .from('prospects')
      .update({ converted_contact_id: contactId })
      .eq('id', prospectId);

    await writeAudit({
      actor_id: actorId,
      action: existing ? 'update' : 'create',
      entity_type: 'contact',
      entity_id: contactId,
      diff: {
        from: 'prospect',
        prospect_id: prospectId,
        ...(existing ? { linked_existing: true } : {}),
      },
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
