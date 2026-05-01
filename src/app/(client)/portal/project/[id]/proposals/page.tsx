import { redirect } from 'next/navigation';

export default async function LegacyClientProposalsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/portal/project/${id}/agreement`);
}
