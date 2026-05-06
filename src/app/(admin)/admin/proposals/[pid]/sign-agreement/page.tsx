import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  getContractByProposalId,
  getProposal,
} from '@/lib/queries/admin';
import {
  deriveContractVariables,
  renderAgreement,
} from '@/lib/contracts/render';
import { ContractBody } from '@/components/contract/contract-body';
import { SignaturePair } from '@/components/contract/signature-block';
import { AdminSignForm } from '@/components/admin/proposals/admin-sign-form';

/**
 * Admin preview-and-sign for the agreement. Renders the exact text that
 * will become the contract body the moment admin signs, so admin reviews
 * what they're committing to before counter-signing.
 *
 * If a contract has already been created from this proposal, redirect
 * straight to the contract detail page — no need to preview again.
 */
export default async function AdminSignAgreementPage({
  params,
}: {
  params: Promise<{ pid: string }>;
}) {
  const { pid } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const [proposal, existing] = await Promise.all([
    getProposal(pid),
    getContractByProposalId(pid),
  ]);
  if (!proposal) notFound();

  if (existing) {
    const target = existing.projectId
      ? `/admin/projects/${existing.projectId}/contracts/${existing.id}`
      : `/admin/contracts/${existing.id}`;
    redirect(target);
  }

  if (proposal.status !== 'accepted') {
    // Sign-agreement is only valid after the client has accepted. Anything
    // else falls back to the editor — admin probably mis-routed here.
    redirect(`/admin/proposals/${pid}`);
  }

  // Pull admin's display name to prefill the signature input.
  let adminFullName: string | null = null;
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('full_name')
      .eq('id', session.userId)
      .single();
    adminFullName = (data?.full_name as string | null) ?? null;
  } catch {
    /* fall back to empty input */
  }

  // Render the agreement body that WILL be saved on sign.
  const effectiveDate = proposal.acceptedAt ?? new Date().toISOString();
  const variables = deriveContractVariables(proposal.content, {
    effectiveDate,
  });
  const agreementVersion = proposal.content.agreement_version || '1.1';
  const { body_md } = await renderAgreement(variables, {
    version: `v${agreementVersion.replace(/^v/, '')}`,
  });

  const backHref = proposal.projectId
    ? `/admin/projects/${proposal.projectId}/proposals/${pid}`
    : `/admin/proposals/${pid}`;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
          >
            ← Proposal
          </Link>
          <span aria-hidden className="h-3 w-px bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper">
            Preview & sign · v{agreementVersion}
          </span>
        </div>
      </div>

      <header>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
          Agreement preview
        </p>
        <h1 className="mt-2 font-display text-2xl font-medium tracking-tight text-ink">
          Review the legal terms before signing
        </h1>
        <p className="mt-2 font-sans text-sm text-ink-muted">
          Below is the exact contract body that will be frozen the moment
          you counter-sign — same content the client will see and sign
          against. Variables are already substituted from the proposal.
        </p>
      </header>

      <article className="rounded-2xl border border-border bg-surface p-8 md:p-10 print-plain">
        <ContractBody body={body_md} />
      </article>

      <section className="space-y-3">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-ink-muted">
          Signatures
        </h2>
        <SignaturePair
          adminSignerName={null}
          adminSignedAt={null}
          clientName={proposal.content.client.name || '—'}
          clientSignerName={null}
          clientSignedAt={null}
        />
      </section>

      <AdminSignForm
        proposalId={pid}
        defaultSignerName={adminFullName ?? undefined}
      />
    </main>
  );
}
