import { FileIcon } from '@/components/ui/icons';
import { formatBytes } from '@/lib/format';

export function FileSummary({ name, size }: { name: string; size: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <FileIcon />
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold" title={name}>
          {name}
        </p>
        <p className="text-sm text-muted">{formatBytes(size)}</p>
      </div>
    </div>
  );
}
