import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { flattenJoin } from '@/lib/array-join';

export const runtime = 'nodejs';

const Schema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().min(1).max(5000),
  consent_to_publish: z.boolean(),
});

/**
 * DELETE — client un-submits their review within 24 hours of posting.
 * After 24h, contact support. Useful when the client wants to revise
 * what they wrote before it stays on the public reviews surface.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/projects/[id]/review:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id: projectId } = await params;

    const sb = supabaseAdmin();
    // Ownership check.
    const { data: project } = await sb
      .from('projects')
      .select('id, contacts!inner(user_id)')
      .eq('id', projectId)
      .single();
    type ProjectRow = {
      contacts: { user_id: string | null } | { user_id: string | null }[];
    };
    const contact = project ? flattenJoin((project as unknown as ProjectRow).contacts) : null;
    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: existing } = await sb
      .from('project_reviews')
      .select('client_submitted_at, client_submitted_by')
      .eq('project_id', projectId)
      .maybeSingle();
    type Existing = { client_submitted_at: string | null; client_submitted_by: string | null } | null;
    const r = existing as Existing;
    if (!r?.client_submitted_at) {
      return Response.json({ error: 'No review to remove.' }, { status: 404 });
    }
    if (r.client_submitted_by !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const ageMs = Date.now() - new Date(r.client_submitted_at).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      return Response.json(
        { error: 'Reviews can only be un-submitted within 24 hours. Contact support to edit.' },
        { status: 409 },
      );
    }

    const { error } = await sb
      .from('project_reviews')
      .update({
        client_rating: null,
        client_review: null,
        client_consent_to_publish: false,
        client_submitted_at: null,
        client_submitted_by: null,
      })
      .eq('project_id', projectId);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'project_review',
      entity_id: projectId,
      diff: { un_submit: true, by: 'client' },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/projects/[id]/review DELETE', err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/projects/[id]/review:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
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
    const contact = flattenJoin(p.contacts);
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
    return safeError('client/projects/[id]/review', err);
  }
}
