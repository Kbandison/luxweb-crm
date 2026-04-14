import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type AuditEntry = {
  actor_id: string;
  action: 'create' | 'update' | 'delete' | 'send' | 'accept' | 'reject' | string;
  entity_type: string;
  entity_id?: string;
  diff?: Record<string, unknown>;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await supabaseAdmin().from('audit_log').insert(entry);
}
