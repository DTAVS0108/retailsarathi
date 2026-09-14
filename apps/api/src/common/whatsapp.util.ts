import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const waUploadDir = join(process.cwd(), 'uploads', 'whatsapp');
mkdirSync(waUploadDir, { recursive: true });

export type WhatsAppSendResult = {
  sent: boolean;
  mode: 'api' | 'link' | 'api_media';
  shareUrl: string | null;
  mediaUrl?: string | null;
  mediaPath?: string | null;
  note?: string;
  error?: string;
};

function digitsToWa(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

/**
 * Send WhatsApp text, optionally with an HTML document attachment when WHATSAPP_API_URL is set.
 * Always returns a wa.me shareUrl for manual open / mobile share.
 */
export async function sendWhatsAppWithOptionalMedia(opts: {
  phone?: string | null;
  text: string;
  /** HTML (or any) document content to attach when API supports media */
  htmlDocument?: string;
  filename?: string;
  meta?: Record<string, unknown>;
}): Promise<WhatsAppSendResult> {
  const waPhone = digitsToWa(opts.phone);
  const shareUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(opts.text)}`
    : null;

  let mediaPath: string | null = null;
  let mediaUrl: string | null = null;
  if (opts.htmlDocument) {
    const safe = (opts.filename || `wa-${Date.now()}.html`).replace(/[^a-zA-Z0-9._-]/g, '-');
    mediaPath = join(waUploadDir, safe);
    writeFileSync(mediaPath, opts.htmlDocument, 'utf8');
    const origin = (process.env.PUBLIC_API_ORIGIN || process.env.API_ORIGIN || 'http://localhost:4000').replace(
      /\/$/,
      '',
    );
    mediaUrl = `${origin}/uploads/whatsapp/${safe}`;
  }

  const apiUrl = process.env.WHATSAPP_API_URL?.trim();
  if (apiUrl && waPhone) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN ?? ''}`,
        },
        body: JSON.stringify({
          to: waPhone,
          message: opts.text,
          ...(mediaUrl
            ? {
                mediaUrl,
                mediaType: 'document',
                filename: opts.filename || 'statement.html',
              }
            : {}),
          ...opts.meta,
        }),
      });
      const bodyText = await res.text().catch(() => '');
      if (!res.ok) {
        return {
          sent: false,
          mode: mediaUrl ? 'api_media' : 'api',
          shareUrl,
          mediaUrl,
          mediaPath,
          error: `WhatsApp API ${res.status}: ${bodyText.slice(0, 200)}`,
        };
      }
      return {
        sent: true,
        mode: mediaUrl ? 'api_media' : 'api',
        shareUrl,
        mediaUrl,
        mediaPath,
        note: mediaUrl ? 'Sent via WHATSAPP_API_URL with media' : 'Sent via WHATSAPP_API_URL',
      };
    } catch (e) {
      return {
        sent: false,
        mode: mediaUrl ? 'api_media' : 'api',
        shareUrl,
        mediaUrl,
        mediaPath,
        error: String(e),
      };
    }
  }

  return {
    sent: false,
    mode: 'link',
    shareUrl,
    mediaUrl,
    mediaPath,
    note: mediaUrl
      ? 'No WHATSAPP_API_URL — open shareUrl and attach saved HTML, or configure API for auto media send'
      : 'No WHATSAPP_API_URL — open shareUrl',
  };
}
