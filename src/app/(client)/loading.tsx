export default function ClientLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-copper"
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
          Loading…
        </p>
      </div>
    </div>
  );
}
