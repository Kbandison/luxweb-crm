'use client';
import { useEffect } from 'react';

// Contracts already reported on this page load. Module-level so React's
// development double-mount (StrictMode) doesn't count one open twice.
const reported = new Set<string>();

/**
 * Tells the server the client opened this agreement, once per page load.
 * Renders nothing; failures are ignored — a missed view count never
 * matters more than the page working.
 */
export function AgreementViewBeacon({ contractId }: { contractId: string }) {
  useEffect(() => {
    if (reported.has(contractId)) return;
    reported.add(contractId);
    void fetch(`/api/client/contracts/${contractId}/viewed`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => {});
  }, [contractId]);
  return null;
}
