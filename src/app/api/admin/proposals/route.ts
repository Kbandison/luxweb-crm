import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { defaultProposalContent } from '@/lib/types/proposal';

export const runtime = 'nodejs';

const CreateSchema = z
  .object({
    contact_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
  })
  .refine((v) => v.contact_id || v.project_id, {
    message: 'Provide either contact_id or project_id',
  });

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const raw = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Resolve contact from either the explicit contact_id or via the
    // project's linked contact. Projects take precedence when both present
    // because the contact on the project is authoritative.
    let contactId = parsed.data.contact_id ?? null;
    let dealId: string | null = null;
    let contactName = '';
    let contactEmail = '';

    if (parsed.data.project_id) {
      const { data: project } = await supabaseAdmin()
        .from('projects')
        .select('id, deal_id, contact_id, contacts!inner(full_name, email)')
        .eq('id', parsed.data.project_id)
        .single();
      if (!project) {
        return Response.json({ error: 'Project not found' }, { status: 404 });
      }
      type Project = {
        deal_id: string | null;
        contact_id: string;
        contacts:
          | { full_name: string; email: string | null }
          | { full_name: string; email: string | null }[];
      };
      const p = project as unknown as Project;
      const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
      contactId = p.contact_id;
      dealId = p.deal_id;
      contactName = c?.full_name ?? '';
      contactEmail = c?.email ?? '';
    } else if (contactId) {
      const { data: contact } = await supabaseAdmin()
        .from('contacts')
        .select('id, full_name, email')
        .eq('id', contactId)
        .single();
      if (!contact) {
        return Response.json({ error: 'Contact not found' }, { status: 404 });
      }
      contactName = (contact.full_name as string) ?? '';
      contactEmail = (contact.email as string | null) ?? '';
    }

    if (!contactId) {
      return Response.json(
        { error: 'Could not resolve contact for proposal' },
        { status: 400 },
      );
    }

    const content = defaultProposalContent({
      clientName: contactName,
      clientEmail: contactEmail,
    });

    const { data, error } = await supabaseAdmin()
      .from('proposals')
      .insert({
        contact_id: contactId,
        project_id: parsed.data.project_id ?? null,
        deal_id: dealId,
        title: parsed.data.title,
        status: 'draft',
        content_json: content,
        total_cents: 0,
      })
      .select('id')
      .single();

    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Insert failed' },
        { status: 500 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'proposal',
      entity_id: data.id as string,
    });

    return Response.json({ id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
