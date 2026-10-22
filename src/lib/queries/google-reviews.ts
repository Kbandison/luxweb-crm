import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { flattenJoin } from '@/lib/array-join';
import { showsOnSite } from '@/lib/google-reviews/rules';

/** Read queries for the studio's Google reviews. All fail soft. */

export type GoogleReview = {
  id: string;
  reviewerName: string;
  rating: number;
  body: string | null;
  reviewedAt: string;
  replied: boolean;
  contactId: string | null;
  contactName: string | null;
  /** Kevin's switch: null means the default rule decides. */
  showOnSite: boolean | null;
  /** Whether it's on luxwebstudio.dev right now. */
  onSite: boolean;
  removedAt: string | null;
};

type Row = {
  id: string;
  reviewer_name: string;
  rating: number;
  body: string | null;
  reviewed_at: string;
  replied: boolean;
  contact_id: string | null;
  show_on_site: boolean | null;
  removed_at: string | null;
  contacts: { full_name: string } | { full_name: string }[] | null;
};

const SELECT =
  'id, reviewer_name, rating, body, reviewed_at, replied, contact_id, show_on_site, removed_at, contacts(full_name)';

function toReview(r: Row): GoogleReview {
  return {
    id: r.id,
    reviewerName: r.reviewer_name,
    rating: r.rating,
    body: r.body,
    reviewedAt: r.reviewed_at,
    replied: r.replied,
    contactId: r.contact_id,
    contactName: r.contacts ? flattenJoin(r.contacts)?.full_name ?? null : null,
    showOnSite: r.show_on_site,
    onSite: showsOnSite({
      rating: r.rating,
      body: r.body,
      showOnSite: r.show_on_site,
      removedAt: r.removed_at,
    }),
    removedAt: r.removed_at,
  };
}

export async function getGoogleReviews(): Promise<GoogleReview[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('google_reviews')
      .select(SELECT)
      .order('reviewed_at', { ascending: false });
    return ((data ?? []) as Row[]).map(toReview);
  } catch {
    return [];
  }
}

/** The client's newest review still on Google, if they've left one. */
export async function getGoogleReviewForContact(
  contactId: string,
): Promise<GoogleReview | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('google_reviews')
      .select(SELECT)
      .eq('contact_id', contactId)
      .is('removed_at', null)
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? toReview(data as Row) : null;
  } catch {
    return null;
  }
}

/** For the portal: the signed-in client's Google review, via a project they own. */
export async function getClientGoogleReview(
  projectId: string,
  userId: string,
): Promise<GoogleReview | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('projects')
      .select('contacts!inner(id, user_id)')
      .eq('id', projectId)
      .maybeSingle();
    type Owner = { contacts: { id: string; user_id: string | null } | { id: string; user_id: string | null }[] };
    const contact = data ? flattenJoin((data as unknown as Owner).contacts) : null;
    if (!contact || contact.user_id !== userId) return null;
    return getGoogleReviewForContact(contact.id);
  } catch {
    return null;
  }
}

export type ContactChoice = { id: string; name: string };

/** Every contact, for linking a review to the client who wrote it. */
export async function getContactChoices(): Promise<ContactChoice[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('contacts')
      .select('id, full_name, company')
      .order('full_name', { ascending: true });
    type C = { id: string; full_name: string; company: string | null };
    return ((data ?? []) as C[]).map((c) => ({
      id: c.id,
      name: c.company ? `${c.full_name} (${c.company})` : c.full_name,
    }));
  } catch {
    return [];
  }
}
