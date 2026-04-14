import { NotificationBell } from '@/components/notifications/notification-bell';

// Server component — the sidebar owns the user menu + sign out.
// Topbar hosts the page title + notifications bell.
export function Topbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-surface/70 px-6 backdrop-blur print:hidden">
      <h1 className="font-display text-lg font-medium tracking-tight text-ink">
        {title}
      </h1>
      <NotificationBell />
    </header>
  );
}
