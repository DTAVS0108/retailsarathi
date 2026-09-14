export type DocumentKind = 'image' | 'pdf' | 'other';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif)(\?|$)/i;
const PDF_EXT = /\.pdf(\?|$)/i;

/** Prefer same-origin `/uploads/...` (Next proxy). Set NEXT_PUBLIC_API_ORIGIN to bypass. */
export function resolveUploadUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.toLowerCase().lastIndexOf('/uploads/');
  const rel = idx >= 0 ? normalized.slice(idx) : normalized.startsWith('/uploads/') ? normalized : null;

  if (!rel) {
    const parts = normalized.split('/uploads/');
    if (parts.length > 1) {
      const proxied = `/uploads/${parts[1]}`;
      const origin = process.env.NEXT_PUBLIC_API_ORIGIN;
      return origin ? `${origin}${proxied}` : proxied;
    }
    return null;
  }

  const origin = process.env.NEXT_PUBLIC_API_ORIGIN;
  return origin ? `${origin}${rel}` : rel;
}

export function guessMimeFromName(name?: string | null): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (PDF_EXT.test(lower)) return 'application/pdf';
  if (IMAGE_EXT.test(lower)) return 'image/jpeg';
  return null;
}

export function isImageMime(mime?: string | null): boolean {
  return Boolean(mime && /^image\//i.test(mime));
}

export function isPdfMime(mime?: string | null): boolean {
  return Boolean(mime && /pdf/i.test(mime));
}

export function documentKind(url: string, mimeType?: string | null, fileName?: string | null): DocumentKind {
  if (isImageMime(mimeType) || IMAGE_EXT.test(url)) return 'image';
  if (isPdfMime(mimeType) || PDF_EXT.test(url)) return 'pdf';
  const guessed = guessMimeFromName(fileName);
  if (isImageMime(guessed)) return 'image';
  if (isPdfMime(guessed)) return 'pdf';
  if (url.includes('/uploads/repairs/') && !PDF_EXT.test(url)) return 'image';
  return 'other';
}
