import { supabaseAdmin } from '@/lib/supabase/admin';
import { clientIp, limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { flattenJoin } from '@/lib/array-join';

export const runtime = 'nodejs';

/**
 * Public, unauthenticated testimonials feed.
 *
 * Consumed by the luxwebstudio.dev marketing site (and anywhere else that
 * wants to render social proof). Returns only reviews the client has
 * explicitly consented to publish, attached to projects that are actually
 * completed — we don't want in-progress work surfaced as a testimonial.
 *
 * Privacy:
 *   · Strips email, contact ids, project ids beyond the review itself, etc.
 *   · Splits the client's full name into first + last initial so we never
 *     publish someone's full identity without a deliberate flag.
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
  clientFirstName: string;
  clientLastInitial: string;
  projectName: string;
  submittedAt: string;
};

type ReviewRow = {
  project_id: string;
  client_rating: number | null;
  client_review: string | null;
  client_submitted_at: string | null;
  projects:
    | {
        name: string | null;
        status: string | null;
        contacts:
          | { full_name: string | null }
          | { full_name: string | null }[]
          | null;
      }
    | {
        name: string | null;
        status: string | null;
        contacts:
          | { full_name: string | null }
          | { full_name: string | null }[]
          | null;
      }[]
    | null;
};

/**
 * "Smith" -> { first: "Smith", initial: "" }
 * "Jane Smith" -> { first: "Jane", initial: "S." }
 * "Jane Q. Smith" -> { first: "Jane", initial: "S." } (uses the LAST token)
 * "" / null -> { first: "Anonymous", initial: "" }
 */
function splitName(full: string | null | undefined): {
  first: string;
  initial: string;
} {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return { first: 'Anonymous', initial: '' };
  const parts = trimmed.split(/\s+/);
  const first = parts[0] ?? 'Anonymous';
  if (parts.length < 2) return { first, initial: '' };
  const last = parts[parts.length - 1] ?? '';
  const firstChar = last.charAt(0);
  return {
    first,
    initial: firstChar ? `${firstChar.toUpperCase()}.` : '',
  };
}

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
      .from('project_reviews')
      .select(
        'project_id, client_rating, client_review, client_submitted_at, projects!inner(name, status, contacts!inner(full_name))',
      )
      .eq('client_consent_to_publish', true)
      .not('client_submitted_at', 'is', null)
      .eq('projects.status', 'completed')
      .order('client_submitted_at', { ascending: false, nullsFirst: false });

    if (error) {
      return Response.json(
        { error: 'Failed to load reviews' },
        { status: 500, headers },
      );
    }

    const rows = (data ?? []) as ReviewRow[];
    const reviews: PublicReview[] = [];
    for (const r of rows) {
      const project = flattenJoin(r.projects);
      if (!project) continue;
      // Belt-and-suspenders: even with the eq filter, refuse to publish
      // anything that isn't explicitly completed.
      if (project.status !== 'completed') continue;

      const rating = r.client_rating;
      const body = (r.client_review ?? '').trim();
      const submittedAt = r.client_submitted_at;
      if (rating == null || rating < 1 || rating > 5) continue;
      if (!body) continue;
      if (!submittedAt) continue;

      const contact = flattenJoin(project.contacts);
      const { first, initial } = splitName(contact?.full_name);

      reviews.push({
        id: r.project_id,
        rating: Math.round(rating),
        review: body,
        clientFirstName: first,
        clientLastInitial: initial,
        projectName: (project.name ?? '').trim() || 'Project',
        submittedAt,
      });
    }

    return Response.json({ reviews }, { status: 200, headers });
  } catch {
    return Response.json(
      { error: 'Unexpected error' },
      { status: 500, headers },
    );
  }
}
