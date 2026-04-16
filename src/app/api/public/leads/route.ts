import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserId } from '@/lib/notifications';

export const runtime = 'nodejs';

/**
 * Public, unauthenticated lead capture. Posted to by the marketing site
 * (luxwebstudio.dev) and any other first-party surface we want to funnel
 * into the CRM.
 *
 * Hardening:
 *   · CORS allowlist (no wildcard)
 *   · Honeypot field — silently accept + discard bot submissions so they
 *     don't retry the endpoint looking for a different response shape
 *   · Generic error responses — no internal details leak
 *
 * On a genuine submission we check by email for an existing contact. If
 * one exists we append the message as a note rather than creating a
 * duplicate; if not, a new contact is created with source='website' (or
 * whatever the payload declared).
 */

const ALLOWED_ORIGINS = [
  'https://luxwebstudio.dev',
  'https://www.luxwebstudio.dev',
  // Local dev — harmless in prod since browsers won't send this Origin.
  'http://localhost:3000',
];

const CreateLeadSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  phone: z.string().max(60).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
  message: z.string().max(4000).optional().nullable(),
  /** Honeypot — must be empty / absent on real submissions. */
  website: z.string().max(0).optional().nullable(),
});

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function POST(req: Request) {
  const headers = corsHeaders(req.headers.get('origin'));

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = CreateLeadSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload' },
        { status: 400, headers },
      );
    }

    // Honeypot — return a 200 as if accepted so bots don't retry.
    if (parsed.data.website && parsed.data.website.length > 0) {
      return Response.json({ ok: true }, { status: 200, headers });
    }

    const emailLower = parsed.data.email.toLowerCase().trim();
    const source = parsed.data.source?.trim() || 'website';

    const sb = supabaseAdmin();

    // Check for an existing contact by email (case-insensitive).
    const { data: existing } = await sb
      .from('contacts')
      .select('id, full_name, email, company, user_id')
      .ilike('email', emailLower)
      .limit(1)
      .maybeSingle();

    let contactId: string;
    let fullName: string;
    let company: string | null;
    const isNew = !existing;

    if (existing) {
      contactId = existing.id as string;
      fullName = (existing.full_name as string) ?? parsed.data.full_name;
      company = (existing.company as string | null) ?? null;
    } else {
      const { data: created, error } = await sb
        .from('contacts')
        .insert({
          full_name: parsed.data.full_name.trim(),
          email: emailLower,
          phone: parsed.data.phone ?? null,
          company: parsed.data.company ?? null,
          source,
          tags: [],
          lead_score: 10,
        })
        .select('id, full_name, company')
        .single();

      if (error || !created) {
        return Response.json(
          { error: 'Insert failed' },
          { status: 500, headers },
        );
      }

      contactId = created.id as string;
      fullName = (created.full_name as string) ?? parsed.data.full_name;
      company = (created.company as string | null) ?? null;

      await writeAudit({
        actor_id: null as unknown as string, // system event
        action: 'create',
        entity_type: 'contact',
        entity_id: contactId,
        diff: { source, origin: 'public_api' },
      });
    }

    // Store the message as a note (admin-only by default).
    if (parsed.data.message && parsed.data.message.trim().length > 0) {
      await sb.from('notes').insert({
        entity_type: 'contact',
        entity_id: contactId,
        body: parsed.data.message.trim(),
        is_private: true,
        author_id: null,
      });
    }

    // Notify the admin — new lead or fresh inquiry from an existing one.
    const adminId = await getAdminUserId();
    if (adminId) {
      await notify({
        type: 'new_lead',
        userId: adminId,
        contactId,
        fullName,
        email: emailLower,
        company,
        source,
        message: parsed.data.message ?? null,
        leadPath: `/admin/leads?lead=${contactId}`,
      });
    }

    return Response.json(
      { ok: true, created: isNew },
      { status: 201, headers },
    );
  } catch {
    return Response.json(
      { error: 'Unexpected error' },
      { status: 500, headers },
    );
  }
}
