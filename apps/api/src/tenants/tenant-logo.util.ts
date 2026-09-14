import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs';
import { extname, join } from 'path';

export const TENANT_LOGOS_TMP = join(process.cwd(), 'uploads', 'tenant-logos-tmp');
export const TENANT_LOGOS_ROOT = join(process.cwd(), 'uploads', 'tenants');

mkdirSync(TENANT_LOGOS_TMP, { recursive: true });
mkdirSync(TENANT_LOGOS_ROOT, { recursive: true });

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function isAllowedLogoMime(mime?: string) {
  return ALLOWED_MIME.has((mime || '').toLowerCase());
}

export function safeLogoExt(originalName: string, mime?: string) {
  const fromName = extname(originalName).toLowerCase();
  if (ALLOWED_EXT.has(fromName)) return fromName === '.jpeg' ? '.jpg' : fromName;
  const m = (mime || '').toLowerCase();
  if (m === 'image/jpeg') return '.jpg';
  if (m === 'image/png') return '.png';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/gif') return '.gif';
  return '.png';
}

export function tenantLogoRelPath(tenantId: string, ext: string) {
  return `/uploads/tenants/${tenantId}/logo${ext}`;
}

export function deleteTenantLogoFile(logoUrl?: string | null) {
  if (!logoUrl) return;
  try {
    const rel = logoUrl.replace(/^\//, '').replace(/\\/g, '/');
    const full = join(process.cwd(), rel);
    if (existsSync(full)) unlinkSync(full);
  } catch {
    /* best-effort */
  }
}

export function storeTenantLogoFile(tenantId: string, file: Express.Multer.File) {
  const ext = safeLogoExt(file.originalname, file.mimetype);
  const tenantDir = join(TENANT_LOGOS_ROOT, tenantId);
  mkdirSync(tenantDir, { recursive: true });

  for (const name of existsSync(tenantDir) ? readdirSync(tenantDir) : []) {
    if (String(name).startsWith('logo.')) {
      try {
        unlinkSync(join(tenantDir, name));
      } catch {
        /* ignore */
      }
    }
  }

  const dest = join(tenantDir, `logo${ext}`);
  renameSync(file.path, dest);
  return tenantLogoRelPath(tenantId, ext);
}
