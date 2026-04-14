import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProfile } from '@/lib/queries/client';
import { ClientTopbar } from '@/components/client/topbar';

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'client') redirect('/admin/dashboard');

  const profile = await getClientProfile(session.userId);

  return (
    <div className="min-h-dvh bg-bg">
      <ClientTopbar
        userEmail={profile?.email ?? session.email}
        userName={profile?.fullName ?? null}
      />
      {children}
    </div>
  );
}
