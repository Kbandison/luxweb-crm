import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type AuditEntry = {
  /** Null when the actor is the system (cron, webhook, public form). */
  actor_id: string | null;
  action: 'create' | 'update' | 'delete' | 'send' | 'accept' | 'reject' | string;
  entity_type: string;
  entity_id?: string;
  diff?: Record<string, unknown>;
};

// Keys that may carry PII; we redact these in audit_log.diff so the table
// stays readable for compliance investigations without storing customer
// data outside its primary surfaces.
const PII_KEYS = new Set([
  'email',
  'phone',
  'username',
  'signing_name',
  'signed_name',
  'admin_signed_name',
  'contact_email',
  'client_email',
  'recipient',
  'to',
]);

function redactPii(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redactPii);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_KEYS.has(k.toLowerCase())) {
        out[k] = '[redacted]';
      } else {
        out[k] = redactPii(v);
      }
    }
    return out;
  }
  return value;
}

/**
 * Best-effort audit write. Never throws — a logging failure (schema drift,
 * network blip) must not bubble up and fail the caller's mutation, which
 * has already succeeded by the time this is called.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const cleaned: AuditEntry = {
      ...entry,
      diff: entry.diff
        ? (redactPii(entry.diff) as Record<string, unknown>)
        : undefined,
    };
    const { error } = await supabaseAdmin().from('audit_log').insert(cleaned);
    if (error) {
      console.warn('[audit] failed to write audit row:', error);
    }
  } catch (err) {
    console.warn('[audit] failed to write audit row:', err);
  }
}
