import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type AuditEntry = {
  actor_id: string;
  action: 'create' | 'update' | 'delete' | 'send' | 'accept' | 'reject' | string;
  entity_type: string;
  entity_id?: string;
  diff?: Record<string, unknown>;
};

/**
 * Best-effort audit write. Never throws — a logging failure (schema drift,
 * network blip) must not bubble up and fail the caller's mutation, which
 * has already succeeded by the time this is called.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from('audit_log').insert(entry);
    if (error) {
      console.warn('[audit] failed to write audit row:', error);
    }
  } catch (err) {
    console.warn('[audit] failed to write audit row:', err);
  }
}
