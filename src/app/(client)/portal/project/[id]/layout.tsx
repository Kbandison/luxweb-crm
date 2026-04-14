import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProject } from '@/lib/queries/client';
import { ClientProjectNav } from '@/components/client/project-nav';
import { formatDate } from '@/lib/formatters';
import {
  PROJECT_STATUS_DOT as STATUS_DOT,
  PROJECT_STATUS_LABEL as STATUS_LABEL,
} from '@/components/admin/projects/status-meta';
import { cn } from '@/lib/utils';

export default async function ClientProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const project = await getClientProject(id, session.userId);
  if (!project) notFound();

  return (
    <>
      {/* Hero header */}
      <section className="relative isolate overflow-hidden border-b border-border bg-surface">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px copper-rule"
        />
        <div className="relative mx-auto w-full max-w-6xl px-6 pb-8 pt-7 md:px-10">
          <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            <Link href="/portal/dashboard" className="hover:text-ink">
              Dashboard
            </Link>
            <span className="text-copper">/</span>
            <span className="text-ink">{project.name}</span>
          </nav>
          <h1 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
            {project.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  STATUS_DOT[project.status] ?? 'bg-ink-subtle',
                )}
                aria-hidden
              />
              {STATUS_LABEL[project.status] ?? project.status}
            </span>
            {project.startDate || project.endDate ? (
              <span className="font-mono text-xs tabular-nums text-ink-subtle">
                {formatDate(project.startDate)}
                {' → '}
                {formatDate(project.endDate)}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <ClientProjectNav projectId={id} />

      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </>
  );
}
