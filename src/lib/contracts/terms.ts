import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { flattenJoin } from '@/lib/array-join';
import type { ProposalContent } from '@/lib/types/proposal';

/**
 * Stripe's days_until_due for an invoice billed under a contract's Net N
 * terms. The Agreement promises "Net {net_days} from invoice date"; invoices
 * used to go out on createAndSendInvoice's 14-day default regardless, so a
 * Net 7 contract produced Net 14 invoices.
 *
 * Net 0 (due on receipt) gets a one-day window — Stripe's docs don't promise
 * 0 is accepted, and a rejected invoice is worse than a day of grace.
 * Undefined when there are no usable terms, which leaves the default.
 */
export function invoiceDueDays(
  netDays: number | string | null | undefined,
): number | undefined {
  const n = typeof netDays === 'string' ? Number.parseInt(netDays, 10) : netDays;
  if (n == null || !Number.isFinite(n) || n < 0) return undefined;
  return Math.max(1, Math.floor(n));
}

/**
 * The Net days of the project's signed agreement, for invoices raised after
 * signing (milestone approvals). Undefined when the project has no signed
 * contract — an ad-hoc project bills on the standard default.
 */
export async function projectInvoiceDueDays(
  projectId: string,
): Promise<number | undefined> {
  try {
    const { data } = await supabaseAdmin()
      .from('contracts')
      .select('signed_at, proposals!inner(content_json)')
      .eq('project_id', projectId)
      .eq('status', 'signed')
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    type Row = {
      proposals:
        | { content_json: ProposalContent | null }
        | { content_json: ProposalContent | null }[];
    };
    const proposal = flattenJoin((data as Row | null)?.proposals);
    return invoiceDueDays(proposal?.content_json?.investment?.net_days);
  } catch {
    return undefined;
  }
}
