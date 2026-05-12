import { redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';

// Role router. If no session (or envs/schema not yet wired), falls back
// to /login. The proxy (Step 4) will enforce the same gate on deep links.
export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  redirect(
    session.role === 'admin' ? '/admin/dashboard' : '/portal/dashboard',
  );
}
