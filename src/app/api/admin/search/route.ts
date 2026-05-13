import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { flattenJoin } from '@/lib/array-join';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Powers the ⌘K command palette. GET /api/admin/search?q=foo
 *
 * Returns up to 5 matches per type across contacts (split into clients/leads
 * by signed-engagement membership) and projects. Searches name/email/company
 * on contacts; name on projects.
 *
 * Empty / whitespace-only `q` returns empty arrays — the palette only fires
 * the network request once the user types something.
 */

const LIMIT = 5;

type ContactHit = {
  id: string;
  full_name: string;
  company: string | null;
};

type ProjectHit = {
  id: string;
  name: string;
  contact_name: string;
};

function sanitize(input: string): string {
  // Same shape as the helper in lib/queries/admin.ts — mirrored here so this
  // route doesn't import server-side query helpers that pull in larger trees.
  if (/[,()\\]/.test(input)) return '';
  return input.replace(/[%_]/g, (m) => `\\${m}`);
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const raw = (url.searchParams.get('q') ?? '').trim();
    if (!raw) {
      return Response.json({ clients: [], leads: [], projects: [] });
    }
    const term = sanitize(raw);
    if (!term) {
      return Response.json({ clients: [], leads: [], projects: [] });
    }

    const sb = supabaseAdmin();

    // Pull the set of contact IDs that have any project or a signed deal —
    // those are CLIENTS, anything else with a match is a LEAD.
    // We over-fetch contacts (LIMIT * 2) so we still have ~5 of each bucket
    // even when the matches are heavily skewed.
    const [contactsRes, projectsRes, signedDealsRes, anyProjectsRes] =
      await Promise.all([
        sb
          .from('contacts')
          .select('id, full_name, company')
          .or(
            `full_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`,
          )
          .order('created_at', { ascending: false })
          .limit(LIMIT * 4),
        sb
          .from('projects')
          .select('id, name, contacts!inner(full_name)')
          .ilike('name', `%${term}%`)
          .order('created_at', { ascending: false })
          .limit(LIMIT),
        sb
          .from('deals')
          .select('contact_id')
          .in('stage', ['active', 'completed', 'retainer']),
        sb.from('projects').select('contact_id'),
      ]);

    const signedIds = new Set<string>([
      ...((signedDealsRes.data ?? []) as { contact_id: string }[]).map(
        (r) => r.contact_id,
      ),
      ...((anyProjectsRes.data ?? []) as { contact_id: string }[]).map(
        (r) => r.contact_id,
      ),
    ]);

    const contactRows = (contactsRes.data ?? []) as {
      id: string;
      full_name: string;
      company: string | null;
    }[];

    const clients: ContactHit[] = [];
    const leads: ContactHit[] = [];
    for (const c of contactRows) {
      if (signedIds.has(c.id)) {
        if (clients.length < LIMIT) {
          clients.push({ id: c.id, full_name: c.full_name, company: c.company });
        }
      } else {
        if (leads.length < LIMIT) {
          leads.push({ id: c.id, full_name: c.full_name, company: c.company });
        }
      }
      if (clients.length >= LIMIT && leads.length >= LIMIT) break;
    }

    type ProjectRow = {
      id: string;
      name: string;
      contacts:
        | { full_name: string }
        | { full_name: string }[]
        | null;
    };
    const projectRows = (projectsRes.data ?? []) as unknown as ProjectRow[];
    const projects: ProjectHit[] = projectRows.map((r) => {
      const c = flattenJoin(r.contacts);
      return {
        id: r.id,
        name: r.name,
        contact_name: c?.full_name ?? '—',
      };
    });

    return Response.json({ clients, leads, projects });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json(
      { clients: [], leads: [], projects: [], error: 'Unexpected error' },
      { status: 500 },
    );
  }
}
