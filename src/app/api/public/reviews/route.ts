import { supabaseAdmin } from '@/lib/supabase/admin';
import { clientIp, limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { GOOGLE_REVIEW_URL, publicName, showsOnSite } from '@/lib/google-reviews/rules';

export const runtime = 'nodejs';

/**
 * Public, unauthenticated testimonials feed.
 *
 * Consumed by the luxwebstudio.dev marketing site. Serves the studio's Google
 * reviews that are on the site (Kevin's switch, or by default 4 and 5 stars
 * with written text) and still on Google, newest first, plus the count and
 * average of every review still on Google, so the site's rating is honest
 * even though it only shows some of them.
 *
 * Privacy: first name and last initial only; no contact, client, or project
 * details ever leave the CRM.
 *
 * Performance:
 *   · CORS open for GET (this is meant to be hit from any origin).
 *   · Cache-Control set so Vercel's edge fronts repeat requests.
 *   · IP rate limit is generous — meant for marketing SSR, not humans.
 */

const PUBLIC_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

const CACHE_HEADERS: HeadersInit = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
};

type PublicReview = {
  id: string;
  rating: number;
  review: string;
  name: string;
  reviewedAt: string;
};

type Row = {
  id: string;
  reviewer_name: string;
  rating: number;
  body: string | null;
  reviewed_at: string;
  show_on_site: boolean | null;
  removed_at: string | null;
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: PUBLIC_HEADERS });
}

export async function GET(req: Request) {
  const headers = new Headers(PUBLIC_HEADERS);
  for (const [k, v] of Object.entries(CACHE_HEADERS)) headers.set(k, v as string);

  // Generous limit — this endpoint is designed to be hit by marketing site
  // SSR / ISR builds, so we leave headroom for crawler bursts. We still
  // gate it so a runaway client can't pin the function open.
  const ip = clientIp(req);
  const limit = limitByKey(`public-reviews:${ip}`, {
    capacity: 60,
    refillPerSec: 60 / 60,
  });
  if (!limit.ok) {
    return rateLimitResponse(limit.retryAfterSec, headers);
  }

  try {
    const { data, error } = await supabaseAdmin()
      .from('google_reviews')
      .select('id, reviewer_name, rating, body, reviewed_at, show_on_site, removed_at')
      .is('removed_at', null)
      .order('reviewed_at', { ascending: false });

    if (error) {
      return Response.json(
        { error: 'Failed to load reviews' },
        { status: 500, headers },
      );
    }

    const rows = (data ?? []) as Row[];
    const reviews: PublicReview[] = rows
      .filter((r) =>
        showsOnSite({
          rating: r.rating,
          body: r.body,
          showOnSite: r.show_on_site,
          removedAt: r.removed_at,
        }),
      )
      // A card needs words; a stars-only review still counts in the summary.
      .filter((r) => !!r.body?.trim())
      .map((r) => ({
        id: r.id,
        rating: r.rating,
        review: (r.body ?? '').trim(),
        name: publicName(r.reviewer_name),
        reviewedAt: r.reviewed_at,
      }));

    const count = rows.length;
    const average =
      count > 0
        ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
        : null;

    return Response.json(
      { reviews, summary: { count, average }, reviewUrl: GOOGLE_REVIEW_URL },
      { status: 200, headers },
    );
  } catch {
    return Response.json(
      { error: 'Unexpected error' },
      { status: 500, headers },
    );
  }
}
