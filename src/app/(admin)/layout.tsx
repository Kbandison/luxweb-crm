import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { Sidebar } from '@/components/admin/sidebar';
import { MobileNav } from '@/components/admin/mobile-nav';

// Defense in depth — proxy.ts already gates, but the layout re-checks
// so a proxy misconfiguration can't expose admin surfaces.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/portal/dashboard');

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
    <div className="flex min-h-dvh">
      <Sidebar userEmail={session.email} userName={fullName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav userEmail={session.email} userName={fullName} />
        {children}
      </div>
    </div>
  );
}
