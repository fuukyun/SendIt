import type { Metadata } from 'next';
import { HistoryView } from '@/components/history/history-view';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: `${t.history.title} · ${t.appName}`,
  robots: { index: false, follow: false },
};

export default function HistoryPage() {
  return <HistoryView />;
}
