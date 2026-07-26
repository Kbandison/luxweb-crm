import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isBackOffice, portalHomeFor } from '@/lib/auth/permissions';
import { Sidebar } from '@/components/admin/sidebar';
import { MobileNav } from '@/components/admin/mobile-nav';
import { CommandPalette } from '@/components/admin/command-palette';
import { ToastProvider } from '@/components/ui/toast';

// Defense in depth — proxy.ts already gates, but the layout re-checks
// so a proxy misconfiguration can't expose admin surfaces. Back-office
// roles (owner / manager / finance) share this area; the nav + individual
// pages narrow access by capability. Contractors/clients are bounced home.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!isBackOffice(session.role)) redirect(portalHomeFor(session.role));

  // Pull full_name for the sidebar chip (best effort).
  let fullName: string | null = null;
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('full_name')
      .eq('id', session.userId)
      .single();
    fullName = (data?.full_name as string | null) ?? null;
  } catch {
    /* noop */
  }

  return (
    <ToastProvider>
      <div className="flex min-h-dvh">
        <Sidebar
          userEmail={session.email}
          userName={fullName}
          role={session.role}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNav
            userEmail={session.email}
            userName={fullName}
            role={session.role}
          />
          {children}
        </div>
      </div>
      <CommandPalette />
    </ToastProvider>
  );
}
