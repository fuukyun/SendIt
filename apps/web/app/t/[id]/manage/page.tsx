import type { Metadata } from 'next';
import { ManageView } from '@/components/manage/manage-view';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ManageView transferId={id} />;
}
