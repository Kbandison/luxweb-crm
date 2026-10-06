import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  deriveContractVariables,
  renderAgreement,
} from '@/lib/contracts/render';
import {
  CURRENT_AGREEMENT_VERSION,
  isKnownAgreementVersion,
  normalizeAgreementVersion,
} from '@/lib/contracts/versions';
import { pairTimelineAndMilestones, type ProposalContent } from '@/lib/types/proposal';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Schema = z.object({
  // The editor's unsaved draft, so the preview matches what's on screen.
  content_json: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/admin/proposals/[id]/agreement-preview
 *
 * Render the Agreement exactly as it would be generated from this draft, so
 * the admin can check every field landed in the right section before
 * sending. Read-only — nothing is saved.
 *
 * A draft previews the editor's unsaved content against the current
 * template (the one Send will pin). Anything already sent previews its
 * stored content against the version it was pinned to.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_proposals');
    const limit = limitByKey(`admin/proposals/[id]/agreement-preview:${session.userId}`, {
      capacity: 60,
      refillPerSec: 1,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { data: row } = await supabaseAdmin()
      .from('proposals')
      .select('status, content_json, accepted_at')
      .eq('id', id)
      .maybeSingle();
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 });

    const isDraft = (row.status as string) === 'draft';
    const content = pairTimelineAndMilestones(
      ((isDraft && parsed.data.content_json
        ? parsed.data.content_json
        : row.content_json) ?? {}) as ProposalContent,
    );

    const pinned = normalizeAgreementVersion(content.agreement_version);
    const version = isDraft
      ? CURRENT_AGREEMENT_VERSION
      : isKnownAgreementVersion(pinned)
        ? pinned
        : null;
    if (!version) {
      return Response.json(
        { error: `Agreement version "${content.agreement_version}" doesn't exist.` },
        { status: 422 },
      );
    }

    const variables = deriveContractVariables(content, {
      effectiveDate: (row.accepted_at as string | null) ?? new Date().toISOString(),
    });
    const { body_md } = await renderAgreement(variables, { version: `v${version}` });

    return Response.json({ body_md, version });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/proposals/[id]/agreement-preview', err);
  }
}
