'use client';

import { useRef, useState, type DragEvent } from 'react';
import { UploadIcon } from '@/components/ui/icons';
import { t } from '@/lib/i18n';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
}

/** Drag-and-drop target that also opens the file picker on click or keyboard. */
export function Dropzone({ onFiles }: DropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
          dragging
            ? 'border-brand-500 bg-brand-50'
            : 'border-line bg-subtle/50 hover:border-brand-500 hover:bg-brand-50/60'
        }`}
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-sm">
          <UploadIcon width={26} height={26} />
        </span>
        <span className="text-base font-semibold">
          {dragging ? t.upload.dropActive : t.upload.dropHere}
        </span>
        <span className="text-sm text-muted">{t.upload.orBrowse}</span>
        <span className="text-xs text-muted">{t.upload.accepted}</span>
      </button>
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = ''; // allows picking the same file again
        }}
      />
    </>
  );
}
