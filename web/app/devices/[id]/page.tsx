import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function DeviceDetailRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/track/${id}`);
}
