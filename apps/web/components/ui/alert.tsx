import type { ReactNode } from 'react';
import { CheckIcon, InfoIcon, WarningIcon } from './icons';

const TONES = {
  info: {
    box: 'border-sky-300/60 bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100 dark:border-sky-800',
    Icon: InfoIcon,
  },
  success: {
    box: 'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800',
    Icon: CheckIcon,
  },
  warning: {
    box: 'border-amber-300/70 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800',
    Icon: WarningIcon,
  },
  error: {
    box: 'border-red-300/60 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100 dark:border-red-800',
    Icon: WarningIcon,
  },
};

export function Alert({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONES;
  title?: string;
  children?: ReactNode;
}) {
  const { box, Icon } = TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${box}`}
    >
      <Icon className="mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}
