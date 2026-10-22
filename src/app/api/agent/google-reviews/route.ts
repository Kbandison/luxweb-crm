import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { AgentGoogleReviewsSchema } from '@/lib/validation/agent';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';
import { matchContact, showsOnSite } from '@/lib/google-reviews/rules';
import { recordReviewOnContact } from '@/lib/google-reviews/record';

export const runtime = 'nodejs';

const COLUMNS =
  'id, google_review_id, reviewer_name, reviewer_photo_url, rating, body, reviewed_at, replied, contact_id, show_on_site, removed_at';

type StoredReview = {
  id: string;
  google_review_id: string;
  reviewer_name: string;
  reviewer_photo_url: string | null;
  rating: number;
  body: string | null;
  reviewed_at: string;
  replied: boolean;
  contact_id: string | null;
  show_on_site: boolean | null;
  removed_at: string | null;
};

/** The fields Google owns. Kevin's switch and client link are never in here. */
const SYNCED = ['reviewer_name', 'reviewer_photo_url', 'rating', 'body', 'replied'] as const;

function result(row: StoredReview, status: 'new' | 'updated' | 'unchanged') {
  return {
    google_review_id: row.google_review_id,
    id: row.id,
    status,
    reviewer_name: row.reviewer_name,
    rating: row.rating,
    contact_id: row.contact_id,
    on_site: showsOnSite({
      rating: row.rating,
      body: row.body,
      showOnSite: row.show_on_site,
      removedAt: row.removed_at,
    }),
  };
}

/**
 * POST /api/agent/google-reviews — the assistant's daily copy of the studio's
 * Google reviews (read from Metricool). A new review is stored and, when the
 * reviewer's name matches exactly one contact, noted on that client. A changed
 * one is updated. With `complete`, a stored review Google no longer shows is
 * marked removed, which takes it off the site.
 *
 * Returns each review as `new`, `updated`, or `unchanged`, with the contact
 * it's linked to (null: Kevin links it on the Reviews page) and whether it's
 * on the site, plus the ones marked removed.
 */
export async function POST(req: Request) {
  try {
    const gate = await agentGate(req, 'google-reviews');
    if (gate instanceof Response) return gate;

    const raw = await req.json().catch(() => ({}));
    const parsed = AgentGoogleReviewsSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { reviews, complete } = parsed.data;

    const sb = supabaseAdmin();
    // One business's reviews: small enough to hold, and the removal check
    // needs all of them anyway.
    const { data: storedData, error: readError } = await sb.from('google_reviews').select(COLUMNS);
    if (readError) {
      return Response.json({ error: readError.message }, { status: 500 });
    }
    const stored = (storedData ?? []) as StoredReview[];
    const byKey = new Map(stored.map((r) => [r.google_review_id, r]));

    const hasNew = reviews.some((r) => !byKey.has(r.google_review_id));
    const contacts = hasNew
      ? (((await sb.from('contacts').select('id, full_name')).data ?? []) as Array<{
          id: string;
          full_name: string;
        }>)
      : [];

    const results: Array<ReturnType<typeof result>> = [];
    for (const r of reviews) {
      const fields = {
        reviewer_name: r.reviewer_name.trim(),
        reviewer_photo_url: r.reviewer_photo_url ?? null,
        rating: r.rating,
        body: r.body?.trim() || null,
        replied: r.replied ?? false,
      };
      const existing = byKey.get(r.google_review_id);

      if (!existing) {
        const contactId = matchContact(fields.reviewer_name, contacts);
        const { data, error } = await sb
          .from('google_reviews')
          .insert({
            google_review_id: r.google_review_id,
            reviewed_at: r.reviewed_at,
            ...fields,
          })
          .select(COLUMNS)
          .single();
        if (error || !data) {
          return Response.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
        }
        let row = data as StoredReview;
        await writeAudit({
          actor_id: gate.ownerId,
          action: 'create',
          entity_type: 'google_review',
          entity_id: row.id,
          diff: { rating: row.rating, matched: contactId !== null, ...VIA_AGENT },
        });
        // The client's note goes in before the link is saved. If either fails,
        // the review comes back unlinked and Kevin links it on the Reviews
        // page, which writes the note, rather than it sitting linked with none.
        if (contactId) {
          try {
            await recordReviewOnContact(contactId, row, gate.ownerId, VIA_AGENT);
            const { error: linkError } = await sb
              .from('google_reviews')
              .update({ contact_id: contactId })
              .eq('id', row.id);
            if (linkError) throw new Error(linkError.message);
            row = { ...row, contact_id: contactId };
          } catch (err) {
            console.error('[agent/google-reviews] client note or link failed:', err);
          }
        }
        byKey.set(row.google_review_id, row);
        results.push(result(row, 'new'));
        continue;
      }

      const patch: Partial<StoredReview> = {};
      for (const key of SYNCED) {
        if (existing[key] !== fields[key]) Object.assign(patch, { [key]: fields[key] });
      }
      // Back on Google after being marked removed.
      if (existing.removed_at) patch.removed_at = null;
      if (Object.keys(patch).length === 0) {
        results.push(result(existing, 'unchanged'));
        continue;
      }

      const { error } = await sb.from('google_reviews').update(patch).eq('id', existing.id);
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
      const row = { ...existing, ...patch };
      byKey.set(row.google_review_id, row);
      await writeAudit({
        actor_id: gate.ownerId,
        action: 'update',
        entity_type: 'google_review',
        entity_id: row.id,
        diff: { changed: Object.keys(patch), rating: row.rating, ...VIA_AGENT },
      });
      results.push(result(row, 'updated'));
    }

    const removed: Array<{ google_review_id: string; id: string; reviewer_name: string }> = [];
    if (complete && reviews.length > 0) {
      const seen = new Set(reviews.map((r) => r.google_review_id));
      const gone = stored.filter((r) => !r.removed_at && !seen.has(r.google_review_id));
      if (gone.length > 0) {
        const { error } = await sb
          .from('google_reviews')
          .update({ removed_at: new Date().toISOString() })
          .in(
            'id',
            gone.map((g) => g.id),
          );
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }
        for (const g of gone) {
          await writeAudit({
            actor_id: gate.ownerId,
            action: 'update',
            entity_type: 'google_review',
            entity_id: g.id,
            diff: { removed_from_google: true, ...VIA_AGENT },
          });
          removed.push({ google_review_id: g.google_review_id, id: g.id, reviewer_name: g.reviewer_name });
        }
      }
    }

    return Response.json({ results, removed });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/google-reviews POST', err);
  }
}
