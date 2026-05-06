import Link from 'next/link';

/**
 * Routes admin to the preview-and-sign page where they review the rendered
 * agreement before counter-signing. Replaces the previous quick-sign
 * dialog because admin should never sign blindly.
 *
 * Styled to match Button (size sm, primary). We render Link directly since
 * the Button component doesn't accept an `as` polymorphic prop.
 */
export function SignAgreementButton({ proposalId }: { proposalId: string }) {
  return (
    <Link
      href={`/admin/proposals/${proposalId}/sign-agreement`}
      className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-copper px-3 font-sans text-xs font-medium text-copper-foreground transition-colors hover:bg-copper/90 active:bg-copper/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      Review &amp; sign agreement
    </Link>
  );
}
