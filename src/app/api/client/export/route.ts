import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

/**
 * GET /api/client/export
 *
 * Streams a JSON dump of everything tied to the calling user — their
 * profile, contact rows, projects, invoices, proposals, contracts,
 * milestones, files (metadata only), and credentials they entered. Does
 * NOT include admin-only fields like profitability_cents, internal
 * notes, lead_score, or admin audit logs.
 *
 * Rate-limited tightly because the underlying query touches a lot of
 * rows. Returned as a downloadable file via Content-Disposition.
 */
export async function GET(_req: Request) {
  try {
    const session = await requireClient();

    const limit = limitByKey(`client/export:${session.userId}`, {
      capacity: 5,
      refillPerSec: 5 / 3600, // 5 exports/hour
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const sb = supabaseAdmin();

    const { data: user } = await sb
      .from('users')
      .select('id, email, full_name, email_prefs, created_at')
      .eq('id', session.userId)
      .single();

    const { data: contacts } = await sb
      .from('contacts')
      .select('id, full_name, email, phone, company, source, tags, created_at')
      .eq('user_id', session.userId);

    const contactIds = (contacts ?? []).map((c) => c.id as string);

    const [{ data: projects }, { data: invoices }, { data: proposals }, { data: contracts_rows }] =
      await Promise.all([
        contactIds.length === 0
          ? Promise.resolve({ data: [] })
          : sb
              .from('projects')
              .select(
                'id, name, status, start_date, end_date, budget_cents, created_at, archived_at',
              )
              .in('contact_id', contactIds),
        contactIds.length === 0
          ? Promise.resolve({ data: [] })
          : sb
              .from('invoices')
              .select(
                'id, project_id, description, amount_cents, status, due_date, paid_at, hosted_invoice_url, created_at',
              )
              .in('contact_id', contactIds),
        contactIds.length === 0
          ? Promise.resolve({ data: [] })
          : sb
              .from('proposals')
              .select(
                'id, title, status, total_cents, sent_at, accepted_at, project_id, created_at',
              )
              .in('contact_id', contactIds)
              .neq('status', 'draft'),
        contactIds.length === 0
          ? Promise.resolve({ data: [] })
          : sb
              .from('contracts')
              .select(
                'id, proposal_id, project_id, agreement_version, status, signed_at, admin_signed_at, created_at',
              )
              .in('contact_id', contactIds),
      ]);

    const projectIds = (projects ?? []).map((p) => p.id as string);
    const [{ data: milestones }, { data: files }] = await Promise.all([
      projectIds.length === 0
        ? Promise.resolve({ data: [] })
        : sb
            .from('milestones')
            .select(
              'id, project_id, title, description, due_date, status, completed_at, amount_cents',
            )
            .in('project_id', projectIds)
            .eq('is_client_visible', true),
      projectIds.length === 0
        ? Promise.resolve({ data: [] })
        : sb
            .from('files')
            .select(
              'id, project_id, file_name, size_bytes, content_type, created_at',
            )
            .in('project_id', projectIds)
            .eq('is_client_visible', true),
    ]);

    const dump = {
      exported_at: new Date().toISOString(),
      profile: user ?? null,
      contacts: contacts ?? [],
      projects: projects ?? [],
      invoices: invoices ?? [],
      proposals: proposals ?? [],
      contracts: contracts_rows ?? [],
      milestones: milestones ?? [],
      files: files ?? [],
    };

    const json = JSON.stringify(dump, null, 2);
    const filename = `luxweb-data-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(json, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/export', err);
  }
}
