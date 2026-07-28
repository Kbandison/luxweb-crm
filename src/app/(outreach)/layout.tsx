import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/supabase/session';
import { portalHomeFor } from '@/lib/auth/permissions';
import { Wordmark } from '@/components/brand/wordmark';
import { ToastProvider } from '@/components/ui/toast';
import { StaffSignOut } from '@/components/staff/staff-sign-out';

// The setter workspace shell. Only the outreach-scoped `setter` role lives
// here; proxy.ts gates too, but the layout re-checks (defense in depth).
export default async function OutreachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'setter') redirect(portalHomeFor(session.role));

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-border bg-surface/80 px-6 backdrop-blur">
          <Link href="/outreach/dashboard" className="flex items-center gap-2">
            <Wordmark size="sm" />
            <span className="font-mono text-[10px] uppercase tracking-meta-hero text-ink-subtle">
              Outreach
            </span>
          </Link>
          <StaffSignOut />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </ToastProvider>
  );
}
