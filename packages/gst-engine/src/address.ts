/** Indian postal address helpers + validation (GST-aligned state codes). */

export const INDIAN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export const INDIAN_STATE_OPTIONS = Object.entries(INDIAN_STATE_CODES)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export interface StructuredAddress {
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  country?: string | null;
}

/** Letters, digits, spaces, and common postal punctuation only. */
const ADDRESS_SAFE = /^[A-Za-z0-9\s,.\-\/#'&()]+$/;
const CITY_SAFE = /^[A-Za-z\s.'\-]+$/;

export function normalizeCountry(raw?: string | null): string {
  const v = (raw ?? 'IN').trim().toUpperCase();
  if (!v || v === 'INDIA' || v === 'IND' || v === 'IN') return 'IN';
  return v.slice(0, 2);
}

export function normalizePincode(raw?: string | null): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, 6);
}

export function isValidIndianPincode(raw?: string | null): boolean {
  return /^[1-9]\d{5}$/.test(normalizePincode(raw));
}

export function isValidGstStateCode(code?: string | null): boolean {
  const c = (code ?? '').trim();
  return Boolean(c && INDIAN_STATE_CODES[c]);
}

/**
 * India Post sorting-district (first 3 PIN digits) → allowed GST state codes.
 * Overlaps are intentional where circles split (e.g. Bihar/Jharkhand, UP/Uttarakhand).
 */
const PIN3_TO_STATES: Array<{ from: number; to: number; states: string[] }> = [
  { from: 110, to: 110, states: ['07'] }, // Delhi
  { from: 121, to: 136, states: ['06'] }, // Haryana
  { from: 140, to: 159, states: ['03'] }, // Punjab
  { from: 160, to: 160, states: ['03', '04'] }, // Punjab / Chandigarh
  { from: 171, to: 177, states: ['02'] }, // Himachal Pradesh
  { from: 180, to: 193, states: ['01'] }, // Jammu & Kashmir
  { from: 194, to: 194, states: ['01', '38'] }, // J&K / Ladakh
  { from: 201, to: 243, states: ['09'] }, // Uttar Pradesh
  { from: 244, to: 249, states: ['05', '09'] }, // Uttarakhand / UP border
  { from: 250, to: 261, states: ['09'] }, // Uttar Pradesh
  { from: 262, to: 263, states: ['05', '09'] }, // Uttarakhand / UP
  { from: 264, to: 285, states: ['09'] }, // Uttar Pradesh
  { from: 301, to: 345, states: ['08'] }, // Rajasthan
  { from: 360, to: 395, states: ['24'] }, // Gujarat
  { from: 396, to: 396, states: ['24', '26'] }, // Gujarat / DNH & DD
  { from: 400, to: 445, states: ['27'] }, // Maharashtra
  { from: 403, to: 403, states: ['30'] }, // Goa (also covered if we special-case below)
  { from: 450, to: 488, states: ['23'] }, // Madhya Pradesh
  { from: 490, to: 497, states: ['22'] }, // Chhattisgarh
  { from: 500, to: 509, states: ['36'] }, // Telangana
  { from: 515, to: 535, states: ['37'] }, // Andhra Pradesh
  { from: 560, to: 591, states: ['29'] }, // Karnataka
  { from: 600, to: 643, states: ['33'] }, // Tamil Nadu
  { from: 605, to: 605, states: ['33', '34'] }, // TN / Puducherry
  { from: 607, to: 607, states: ['33', '34'] }, // TN / Puducherry
  { from: 670, to: 681, states: ['32'] }, // Kerala
  { from: 682, to: 682, states: ['32', '31'] }, // Kerala / Lakshadweep
  { from: 683, to: 695, states: ['32'] }, // Kerala
  { from: 700, to: 743, states: ['19'] }, // West Bengal
  { from: 737, to: 737, states: ['11'] }, // Sikkim
  { from: 744, to: 744, states: ['35'] }, // Andaman & Nicobar
  { from: 751, to: 770, states: ['21'] }, // Odisha
  { from: 781, to: 788, states: ['18'] }, // Assam
  { from: 790, to: 792, states: ['12'] }, // Arunachal Pradesh
  { from: 793, to: 794, states: ['17'] }, // Meghalaya
  { from: 795, to: 795, states: ['14'] }, // Manipur
  { from: 796, to: 796, states: ['15'] }, // Mizoram
  { from: 797, to: 798, states: ['13'] }, // Nagaland
  { from: 799, to: 799, states: ['16'] }, // Tripura
  { from: 800, to: 813, states: ['10'] }, // Bihar
  { from: 814, to: 835, states: ['20'] }, // Jharkhand
  { from: 841, to: 855, states: ['10'] }, // Bihar
];

/** More-specific prefixes override broader ranges (checked first). */
const PIN3_OVERRIDES: Record<number, string[]> = {
  160: ['03', '04'],
  194: ['01', '38'],
  396: ['24', '26'],
  403: ['30'],
  605: ['33', '34'],
  607: ['33', '34'],
  682: ['32', '31'],
  737: ['11'],
  744: ['35'],
};

export function getGstStatesForPincode(raw?: string | null): string[] {
  const pin = normalizePincode(raw);
  if (!isValidIndianPincode(pin)) return [];
  const prefix = Number(pin.slice(0, 3));
  if (PIN3_OVERRIDES[prefix]) return [...PIN3_OVERRIDES[prefix]];
  for (const range of PIN3_TO_STATES) {
    if (range.from > range.to) continue;
    if (prefix >= range.from && prefix <= range.to) return [...range.states];
  }
  return [];
}

export function pincodeMatchesState(pincode?: string | null, stateCode?: string | null): boolean {
  const pin = normalizePincode(pincode);
  const state = (stateCode ?? '').trim();
  if (!pin || !state) return true;
  if (!isValidIndianPincode(pin) || !isValidGstStateCode(state)) return false;
  const allowed = getGstStatesForPincode(pin);
  // Unknown prefix: don't block (APS / new circles) — format checks already ran.
  if (!allowed.length) return true;
  return allowed.includes(state);
}

export function assertPincodeMatchesState(pincode: string, stateCode: string): void {
  if (!pincode || !stateCode) return;
  if (pincodeMatchesState(pincode, stateCode)) return;
  const stateName = INDIAN_STATE_CODES[stateCode] || stateCode;
  const allowed = getGstStatesForPincode(pincode)
    .map((c) => INDIAN_STATE_CODES[c] || c)
    .join(' / ');
  throw new Error(
    `PIN ${pincode} does not belong to ${stateName}. Expected state: ${allowed || 'a matching GST state'}.`,
  );
}

export function assertAddressLine(label: string, raw: string, required = false): string | undefined {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) {
    if (required) throw new Error(`${label} is required.`);
    return undefined;
  }
  if (value.length > 120) throw new Error(`${label} must be at most 120 characters.`);
  if (!ADDRESS_SAFE.test(value)) {
    throw new Error(
      `${label} has invalid characters. Use letters, numbers, spaces, and , . - / # ' & ( ) only.`,
    );
  }
  return value;
}

export function assertCity(raw: string, required = false): string | undefined {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (!value) {
    if (required) throw new Error('City is required.');
    return undefined;
  }
  if (value.length > 60) throw new Error('City must be at most 60 characters.');
  if (!CITY_SAFE.test(value)) {
    throw new Error(`City has invalid characters. Use letters, spaces, . ' - only.`);
  }
  return value;
}

export function assertIndianPincode(raw: string, required = false): string | undefined {
  const pin = normalizePincode(raw);
  if (!pin) {
    if (required) throw new Error('PIN code is required.');
    return undefined;
  }
  if (!isValidIndianPincode(pin)) {
    throw new Error('Enter a valid 6-digit Indian PIN code (e.g. 246701).');
  }
  return pin;
}

export function assertGstStateCode(raw: string, required = false): string | undefined {
  const code = raw.trim();
  if (!code) {
    if (required) throw new Error('State is required.');
    return undefined;
  }
  if (!isValidGstStateCode(code)) {
    throw new Error('Select a valid Indian GST state.');
  }
  return code;
}

export function assertCountry(raw: string): string {
  const country = normalizeCountry(raw);
  if (country !== 'IN') {
    throw new Error('Only India (IN) is supported for shop/customer addresses currently.');
  }
  return country;
}

/** Single-line / multi-line postal block for invoices. */
export function formatIndianAddress(parts: StructuredAddress): string | undefined {
  const line1 = parts.address?.trim();
  const line2 = parts.addressLine2?.trim();
  const city = parts.city?.trim();
  const stateCode = parts.stateCode?.trim();
  const stateName = stateCode ? INDIAN_STATE_CODES[stateCode] : undefined;
  const pin = parts.pincode?.trim();
  const country = normalizeCountry(parts.country);

  const locality = [city, stateName || stateCode, pin].filter(Boolean).join(', ');
  const countryLabel = country === 'IN' ? 'India' : country;
  const lines = [line1, line2, locality, countryLabel].filter(Boolean);
  if (!lines.length) return undefined;
  return lines.join(', ');
}

export function parseAddressPayload(input: {
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
  country?: string | null;
  /** When true, street/city/pin/state are all required together. */
  requireComplete?: boolean;
}): StructuredAddress {
  const requireComplete = Boolean(input.requireComplete);
  const anyFilled = Boolean(
    input.address?.trim() ||
      input.addressLine2?.trim() ||
      input.city?.trim() ||
      input.pincode?.trim() ||
      input.stateCode?.trim(),
  );

  if (!anyFilled && !requireComplete) {
    return {
      address: null,
      addressLine2: null,
      city: null,
      stateCode: input.stateCode?.trim() || null,
      pincode: null,
      country: normalizeCountry(input.country),
    };
  }

  const address = assertAddressLine('Address line 1', input.address ?? '', requireComplete || anyFilled);
  const addressLine2 = assertAddressLine('Address line 2', input.addressLine2 ?? '', false);
  const city = assertCity(input.city ?? '', requireComplete || anyFilled);
  const pincode = assertIndianPincode(input.pincode ?? '', requireComplete || anyFilled);
  const stateCode = assertGstStateCode(input.stateCode ?? '', requireComplete || anyFilled);
  const country = assertCountry(input.country ?? 'IN');
  if (pincode && stateCode) assertPincodeMatchesState(pincode, stateCode);

  return {
    address: address ?? null,
    addressLine2: addressLine2 ?? null,
    city: city ?? null,
    stateCode: stateCode ?? null,
    pincode: pincode ?? null,
    country,
  };
}
