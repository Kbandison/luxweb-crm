import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/supabase/session';
import { portalHomeFor } from '@/lib/auth/permissions';
import { Wordmark } from '@/components/brand/wordmark';
import { ToastProvider } from '@/components/ui/toast';
import { StaffSignOut } from '@/components/staff/staff-sign-out';
import { StaffNav } from '@/components/staff/staff-nav';

// The contractor workspace shell. Defense in depth — proxy.ts gates /staff
// too, but the layout re-checks so a proxy misconfiguration can't expose it.
// Only the assignment-scoped `contractor` role lives here; everyone else is
// bounced to their own home.
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'contractor') redirect(portalHomeFor(session.role));

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-border bg-surface/80 px-6 backdrop-blur">
          <div className="flex items-center gap-4">
            <Link href="/staff/dashboard" className="flex items-center gap-2">
              <Wordmark size="sm" />
              <span className="hidden font-mono text-[10px] uppercase tracking-meta-hero text-ink-subtle sm:inline">
                Workspace
              </span>
            </Link>
            <StaffNav />
          </div>
          <StaffSignOut />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </ToastProvider>
  );
}
