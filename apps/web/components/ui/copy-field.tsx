'use client';

import { useEffect, useId, useState } from 'react';
import { t } from '@/lib/i18n';
import { Button } from './button';
import { CheckIcon, CopyIcon } from './icons';

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const id = useId();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); selecting lets the user copy manually.
      (document.getElementById(id) as HTMLInputElement | null)?.select();
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-xl border border-line bg-subtle px-3 py-2.5 font-mono text-sm text-ink"
        />
        <Button variant="secondary" onClick={copy} aria-live="polite" className="shrink-0">
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span className="hidden sm:inline">{copied ? t.common.copied : t.common.copy}</span>
        </Button>
      </div>
      {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}
