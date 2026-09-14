'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { documentKind, resolveUploadUrl } from '@/lib/upload-url';

export type DocumentViewerProps = {
  path?: string | null;
  url?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  className?: string;
  /** Max height for inline preview (px). Default 280. */
  height?: number;
  /** Show only open/download controls without inline preview. */
  compact?: boolean;
};

function ViewerModal({
  url,
  kind,
  fileName,
  onClose,
}: {
  url: string;
  kind: ReturnType<typeof documentKind>;
  fileName?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={fileName || 'Document viewer'}
      onClick={onClose}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="truncate text-sm font-medium">{fileName || 'Document'}</p>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
          >
            Open in tab
          </a>
          <a
            href={url}
            download={fileName || undefined}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
          >
            Download
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
          >
            Close
          </button>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4"
        onClick={(event) => event.stopPropagation()}
      >
        {kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={fileName || 'Attachment'}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        ) : kind === 'pdf' ? (
          <iframe
            src={url}
            title={fileName || 'PDF document'}
            className="h-full w-full max-w-5xl rounded-lg bg-white shadow-2xl"
          />
        ) : (
          <div className="rounded-2xl bg-white px-6 py-8 text-center text-slate-700 shadow-xl">
            <p className="font-medium">Preview not available for this file type.</p>
            <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-teal-700 underline">
              Open externally
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function DocumentViewer({
  path,
  url: urlProp,
  mimeType,
  fileName,
  className,
  height = 280,
  compact = false,
}: DocumentViewerProps) {
  const [open, setOpen] = useState(false);
  const url = useMemo(() => urlProp ?? resolveUploadUrl(path), [path, urlProp]);
  const kind = useMemo(
    () => (url ? documentKind(url, mimeType, fileName) : 'other'),
    [url, mimeType, fileName],
  );
  const close = useCallback(() => setOpen(false), []);

  if (!url) return null;

  return (
    <div className={className}>
      {!compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition hover:border-teal-300 hover:shadow-sm"
          style={{ height }}
        >
          {kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={fileName || 'Attachment'} className="h-full w-full object-contain" />
          ) : kind === 'pdf' ? (
            <iframe
              src={url}
              title={fileName || 'PDF preview'}
              className="pointer-events-none h-full w-full bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-sm text-slate-600">
              {fileName || 'Attached file'}
            </div>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/70 to-transparent px-3 py-2 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
            Click to expand · {fileName || 'Document'}
          </span>
        </button>
      ) : null}

      <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'mt-2'}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-teal-700 underline-offset-2 hover:underline"
        >
          {compact ? `View ${fileName || 'document'}` : 'Expand viewer'}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="text-sm text-slate-500 hover:text-teal-700">
          Open in tab
        </a>
      </div>

      {open ? <ViewerModal url={url} kind={kind} fileName={fileName} onClose={close} /> : null}
    </div>
  );
}

/** Compact text link that opens the full-screen viewer. */
export function DocumentViewerLink({
  path,
  url: urlProp,
  mimeType,
  fileName,
  children,
  className,
}: DocumentViewerProps & { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const url = useMemo(() => urlProp ?? resolveUploadUrl(path), [path, urlProp]);
  const kind = useMemo(
    () => (url ? documentKind(url, mimeType, fileName) : 'other'),
    [url, mimeType, fileName],
  );
  const close = useCallback(() => setOpen(false), []);

  if (!url) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'text-sm font-medium text-teal-700 underline-offset-2 hover:underline'}
      >
        {children ?? `View ${fileName || 'document'}`}
      </button>
      {open ? <ViewerModal url={url} kind={kind} fileName={fileName} onClose={close} /> : null}
    </>
  );
}
