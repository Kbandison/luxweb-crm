import { redirect } from 'next/navigation';

export default async function LegacyContractsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/projects/${id}/agreement`);
}
