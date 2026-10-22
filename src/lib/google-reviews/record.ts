import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

const STUDIO_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export type ReviewForNote = {
  id: string;
  rating: number;
  body: string | null;
  reviewed_at: string;
};

/**
 * Put a Google review on the client it came from: a private note with the
 * stars and words, and a `google_review` line on the contact's Activity tab.
 * Runs when the assistant matches a new review, and when Kevin links one by
 * hand on the Reviews page.
 */
export async function recordReviewOnContact(
  contactId: string,
  review: ReviewForNote,
  actorId: string,
  via: Record<string, string>,
): Promise<void> {
  const date = STUDIO_DATE.format(new Date(review.reviewed_at));
  const words = review.body?.trim() ? `"${review.body.trim()}"` : '(stars only, no written review)';
  const { data } = await supabaseAdmin()
    .from('notes')
    .insert({
      entity_type: 'contact',
      entity_id: contactId,
      body: `Google review ${date}: ${review.rating}★ ${words}`,
      is_private: true,
      author_id: actorId,
    })
    .select('id')
    .single();

  await writeAudit({
    actor_id: actorId,
    action: 'google_review',
    entity_type: 'contact',
    entity_id: contactId,
    diff: {
      rating: review.rating,
      google_review: review.id,
      note_id: (data as { id: string } | null)?.id ?? null,
      ...via,
    },
  });
}
