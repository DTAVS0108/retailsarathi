/** Resolve API-stored upload paths to a browser/Electron-loadable URL. */

export type DocumentKind = 'image' | 'pdf' | 'other';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif)(\?|$)/i;
const PDF_EXT = /\.pdf(\?|$)/i;

/** `apiUrl` is typically `http://host:4000/api/v1`. */
export function apiOriginFromUrl(apiUrl: string) {
  return apiUrl.replace(/\/api\/v1\/?$/i, '').replace(/\/$/, '');
}

export function resolveUploadUrl(apiUrl: string, path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
    return path;
  }

  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.toLowerCase().lastIndexOf('/uploads/');
  let rel =
    idx >= 0
      ? normalized.slice(idx)
      : normalized.startsWith('/uploads/')
        ? normalized
        : null;

  if (!rel) {
    const parts = normalized.split('/uploads/');
    if (parts.length > 1) rel = `/uploads/${parts[1]}`;
  }
  if (!rel) return null;

  return `${apiOriginFromUrl(apiUrl)}${rel}`;
}

export function documentKind(
  url: string,
  mimeType?: string | null,
  fileName?: string | null,
): DocumentKind {
  if (mimeType && /^image\//i.test(mimeType)) return 'image';
  if (mimeType && /pdf/i.test(mimeType)) return 'pdf';
  if (IMAGE_EXT.test(url) || (fileName && IMAGE_EXT.test(fileName))) return 'image';
  if (PDF_EXT.test(url) || (fileName && PDF_EXT.test(fileName))) return 'pdf';
  return 'other';
}
