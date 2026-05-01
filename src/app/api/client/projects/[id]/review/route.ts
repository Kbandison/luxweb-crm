import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const Schema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().min(1).max(5000),
  consent_to_publish: z.boolean(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const { id: projectId } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Verify ownership.
    const { data: project } = await supabaseAdmin()
      .from('projects')
      .select('id, status, contacts!inner(user_id)')
      .eq('id', projectId)
      .single();
    if (!project) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    type ProjectRow = {
      status: string;
      contacts: { user_id: string | null } | { user_id: string | null }[];
    };
    const p = project as unknown as ProjectRow;
    const contact = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Block submitting before completion.
    if (p.status !== 'completed') {
      return Response.json(
        { error: 'Reviews can only be submitted on completed projects.' },
        { status: 400 },
      );
    }

    // Don't allow re-submitting an already-submitted review.
    const { data: existing } = await supabaseAdmin()
      .from('project_reviews')
      .select('client_submitted_at')
      .eq('project_id', projectId)
      .maybeSingle();
    type Existing = { client_submitted_at: string | null } | null;
    if ((existing as Existing)?.client_submitted_at) {
      return Response.json(
        { error: 'A review has already been submitted for this project.' },
        { status: 409 },
      );
    }

    const submittedAt = new Date().toISOString();

    const { error } = await supabaseAdmin()
      .from('project_reviews')
      .upsert(
        {
          project_id: projectId,
          client_rating: parsed.data.rating,
          client_review: parsed.data.review,
          client_consent_to_publish: parsed.data.consent_to_publish,
          client_submitted_at: submittedAt,
          client_submitted_by: session.userId,
        },
        { onConflict: 'project_id' },
      );

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'project_review',
      entity_id: projectId,
      diff: {
        rating: parsed.data.rating,
        consent_to_publish: parsed.data.consent_to_publish,
        by: 'client',
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
