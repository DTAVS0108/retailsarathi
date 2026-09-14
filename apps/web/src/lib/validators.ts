import { validateGstin } from '@retail-sarathi/gst-engine';
export {
  INDIAN_STATE_CODES,
  INDIAN_STATE_OPTIONS,
  formatIndianAddress,
  parseAddressPayload,
  normalizeCountry,
  normalizePincode,
  pincodeMatchesState,
  assertPincodeMatchesState,
  assertAddressLine,
  assertCity,
  assertIndianPincode,
  assertGstStateCode,
  assertCountry,
} from '@retail-sarathi/gst-engine';

/** Normalize Indian mobile to 10 digits; returns null if invalid. */
export function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const ten =
    digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) return null;
  return ten;
}

export function assertIndianPhone(raw: string, required = true): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (required) throw new Error('Phone number is required.');
    return undefined;
  }
  const phone = normalizeIndianPhone(trimmed);
  if (!phone) throw new Error('Enter a valid 10-digit Indian mobile (starts with 6–9).');
  return phone;
}

export function normalizeGstin(raw: string): string {
  return raw.replace(/[\s\-]/g, '').toUpperCase();
}

export function assertGstinOptional(raw: string): string | undefined {
  const gstin = normalizeGstin(raw);
  if (!gstin) return undefined;
  if (!validateGstin(gstin)) {
    throw new Error('GSTIN must be 15 characters (e.g. 09AAAAA0000A1Z5).');
  }
  return gstin;
}

/** First 2 digits of GSTIN = state code (works once prefix is typed, before full 15-char GSTIN). */
export function stateCodeFromGstin(gstin?: string | null): string | undefined {
  if (!gstin) return undefined;
  const normalized = normalizeGstin(gstin);
  const prefix = normalized.slice(0, 2);
  if (!/^\d{2}$/.test(prefix)) return undefined;
  // Prefer validating full GSTIN when complete; still trust the official prefix either way.
  if (normalized.length >= 15 && !validateGstin(normalized)) return undefined;
  return prefix;
}

export function assertRequired(label: string, value: string) {
  if (!value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export function assertPositiveAmount(label: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return value;
}

export { validateGstin };
