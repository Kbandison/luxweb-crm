import { redirect } from 'next/navigation';

export default async function LegacyClientContractsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/portal/project/${id}/agreement`);
}
