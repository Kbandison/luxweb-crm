import { NotificationBell } from '@/components/notifications/notification-bell';

// Server component — the sidebar owns the user menu + sign out.
// Topbar hosts only utility chrome (notifications). Page titles live in each
// page's PageHeader/<h1>, so the topbar no longer renders the title text.
export function Topbar() {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-end border-b border-border bg-surface/70 px-6 backdrop-blur print:hidden">
      <NotificationBell />
    </header>
  );
}
