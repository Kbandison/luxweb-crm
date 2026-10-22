import { appBaseUrl } from '@/lib/app-url';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { defaultProposalContent } from '@/lib/types/proposal';
import { mergeDraftContent } from '@/lib/proposals/agent-draft';
import { problemsBeforeSend } from '@/lib/proposals/validate';
import { AgentCreateProposalSchema } from '@/lib/validation/agent-proposals';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';

export const runtime = 'nodejs';

/**
 * POST /api/agent/proposals — draft an agreement for a contact from the
 * assistant's call notes. Draft only: sending is Sign & send in the editor,
 * which is Kevin's, so nothing here reaches the client, opens a portal, or
 * raises an invoice.
 *
 * One open draft per contact: a second create is refused (409) with the
 * existing draft's id, so a retry never duplicates it. Edit that one with
 * PATCH /api/agent/proposals/{id}.
 *
 * Returns the draft's editor link and what still stands between it and
 * Sign & send, as the editor would list it.
 */
export async function POST(req: Request) {
  try {
    const gate = await agentGate(req, 'proposals');
    if (gate instanceof Response) return gate;

    const raw = await req.json().catch(() => ({}));
    const parsed = AgentCreateProposalSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const sb = supabaseAdmin();
    const { data: contact } = await sb
      .from('contacts')
      .select('id, full_name, email, company')
      .eq('id', d.contact_id)
      .maybeSingle();
    if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 });
    const c = contact as { full_name: string | null; email: string | null; company: string | null };

    const { data: open } = await sb
      .from('proposals')
      .select('id')
      .eq('contact_id', d.contact_id)
      .eq('status', 'draft')
      .limit(1)
      .maybeSingle();
    if (open) {
      return Response.json(
        { error: 'This contact already has a draft agreement; edit that one.', id: (open as { id: string }).id },
        { status: 409 },
      );
    }

    const content = mergeDraftContent(
      defaultProposalContent({
        clientName: c.full_name ?? '',
        clientEmail: c.email ?? '',
        company: c.company,
      }),
      d.content ?? {},
    );

    const { data, error } = await sb
      .from('proposals')
      .insert({
        contact_id: d.contact_id,
        project_id: null,
        deal_id: null,
        title: d.title,
        status: 'draft',
        content_json: content,
        total_cents: content.investment.total_cents,
      })
      .select('id')
      .single();
    if (error || !data) {
      return Response.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
    }
    const id = (data as { id: string }).id;

    await writeAudit({
      actor_id: gate.ownerId,
      action: 'create',
      entity_type: 'proposal',
      entity_id: id,
      diff: { contact_id: d.contact_id, ...VIA_AGENT },
    });

    // Same as a draft started in the editor: the contact's early deals move
    // to 'proposal', and a deal already past it stays where it is.
    try {
      await sb
        .from('deals')
        .update({ stage: 'proposal', stage_changed_at: new Date().toISOString() })
        .eq('contact_id', d.contact_id)
        .in('stage', ['lead', 'discovery']);
    } catch {
      // Best-effort. Failing here shouldn't lose the draft.
    }

    return Response.json({
      id,
      url: `${appBaseUrl()}/admin/proposals/${id}`,
      problems: problemsBeforeSend(content),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/proposals POST', err);
  }
}
