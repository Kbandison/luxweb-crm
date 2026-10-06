import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getUserFullName } from '@/lib/queries/admin';
import { loadAmendable } from '@/lib/change-orders/service';
import { ChangeOrderForm } from '@/components/admin/change-orders/change-order-form';

/** Write and sign & send a change order against a signed agreement (§ 1.5). */
export default async function NewChangeOrderPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  const { id: projectId, contractId } = await params;
  const [amendable, session] = await Promise.all([loadAmendable(contractId), getSession()]);
  if (!amendable || amendable.projectId !== projectId) notFound();
  const senderName = session ? await getUserFullName(session.userId) : null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-8 py-8">
      <div className="border-b border-border pb-4">
        <Link
          href={`/admin/projects/${projectId}/contracts/${contractId}`}
          className="font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:text-copper"
        >
          ← Agreement
        </Link>
      </div>
      <header className="space-y-1">
        <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
          Change order #{amendable.nextNumber}
        </p>
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">
          {amendable.projectTitle}
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          A change to scope, timeline, or price, in writing and signed by both
          of you — as § 1.5 of the agreement requires.
        </p>
      </header>
      <ChangeOrderForm
        contractId={contractId}
        projectId={projectId}
        nextNumber={amendable.nextNumber}
        currentTotalCents={amendable.currentTotalCents}
        senderName={senderName}
      />
    </main>
  );
}
