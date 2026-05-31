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
import { ProjectRefresher } from '@/components/realtime/project-refresher';
import { ProjectRowRefresher } from '@/components/realtime/project-row-refresher';
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
        <div className="relative mx-auto w-full max-w-7xl px-6 pb-8 pt-7 md:px-10">
          <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-meta-hero text-ink-subtle">
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted">
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
          {project.previewUrl ? (
            <div className="mt-5">
              <a
                href={project.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-copper/40 bg-copper-soft/40 px-4 py-2 font-sans text-sm font-medium text-copper transition-colors hover:bg-copper-soft/70"
              >
                View your site
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
              <p className="mt-1.5 font-sans text-xs text-ink-subtle">
                Temporary preview — your site lives here until your domain is
                connected.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <ClientProjectNav projectId={id} />

      <div className="mx-auto w-full max-w-7xl">{children}</div>
      <ProjectRefresher projectId={id} />
      <ProjectRowRefresher projectId={id} />
    </>
  );
}
