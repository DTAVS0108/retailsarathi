'use client';

import { useRef, useState, type ReactNode } from 'react';
import { cn } from './dashboard-ui';

export function UploadDropzone({
  accept,
  disabled,
  onFile,
  title,
  hint,
  className,
  icon,
}: {
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  title: string;
  hint?: string;
  className?: string;
  icon?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function pick(file: File | undefined) {
    if (!file || disabled) return;
    onFile(file);
  }

  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all duration-200',
        dragOver
          ? 'scale-[1.01] border-teal-500 bg-teal-100/70 shadow-inner'
          : 'border-teal-300 bg-teal-50/40 hover:bg-teal-50',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        pick(e.dataTransfer.files?.[0]);
      }}
    >
      {icon ? <div className="mb-2 text-teal-700">{icon}</div> : null}
      <span className="text-base font-semibold text-teal-800">{title}</span>
      {hint ? <span className="mt-1 text-xs text-teal-700/80">{hint}</span> : null}
      <span className="mt-2 text-[11px] text-teal-600/80">Tap to browse or drop a file here</span>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );
}
