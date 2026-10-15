import type { Metadata } from 'next';
import { DownloadView } from '@/components/download/download-view';

// Share links are private; keep them out of search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DownloadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DownloadView shareToken={token} />;
}
