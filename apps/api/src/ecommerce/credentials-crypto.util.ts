import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function loadKey(): Buffer {
  const raw = process.env.ECOMMERCE_CREDENTIALS_KEY?.trim();
  if (!raw) {
    throw new Error(
      'ECOMMERCE_CREDENTIALS_KEY is not set — required to encrypt marketplace channel credentials at rest. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const key = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ECOMMERCE_CREDENTIALS_KEY must decode to exactly 32 bytes (a hex or base64 AES-256 key)');
  }
  return key;
}

export type EncryptedJson = { __enc: true; iv: string; tag: string; data: string };

export function isEncryptedJson(value: unknown): value is EncryptedJson {
  return !!value && typeof value === 'object' && (value as Record<string, unknown>).__enc === true;
}

/** Encrypts a JSON-serializable object for storage in the credentials column. */
export function encryptJson(obj: Record<string, unknown>): EncryptedJson {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    __enc: true,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

/** Decrypts a value previously produced by encryptJson. Returns {} for empty/legacy plaintext values. */
export function decryptJson(value: unknown): Record<string, unknown> {
  if (!isEncryptedJson(value)) {
    // Legacy plaintext row from before encryption was introduced, or an empty default.
    return (value as Record<string, unknown>) ?? {};
  }
  const key = loadKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
