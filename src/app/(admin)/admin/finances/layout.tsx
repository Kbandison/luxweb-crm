import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { buttonVariants } from '@/components/ui/button';
import { getSession } from '@/lib/supabase/session';
import { hasCapability } from '@/lib/auth/permissions';
import { mercuryConfigured } from '@/lib/mercury/client';
import { FinancesNav } from '@/components/admin/finances/finances-nav';
import { MercurySyncButton } from '@/components/admin/finances/sync-button';

/**
 * Shell for the finance section — chrome, capability gate, and sub-nav.
 *
 * The gate lives here so each child page doesn't repeat it; proxy.ts already
 * prefix-matches /admin/finances to `view_finance`, and this is layer 2.
 */
export default async function FinancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !hasCapability(session.role, 'view_finance')) {
    redirect('/admin/dashboard');
  }
  const connected = mercuryConfigured();

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-6xl space-y-8 px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Money"
          title="Finances"
          description="Cash actually in the bank. Invoiced revenue lives in Earnings."
          actions={
            <>
              <Link
                href="/admin/earnings"
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Earnings
              </Link>
              {connected ? (
                <>
                  <MercurySyncButton days={365} />
                  <MercurySyncButton />
                </>
              ) : null}
            </>
          }
        />
        <FinancesNav />
        {children}
      </main>
    </>
  );
}
