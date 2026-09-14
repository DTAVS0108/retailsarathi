import { apiFetch } from './api';

/** Format a number as Indian Rupees (₹1,23,456.00). */
export function fmtINR(amount: number): string {
  const n = Number(amount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

/** Normalize invoice / ack dates to app display format (21 Jul 2026). */
export function normalizeAppDate(value?: string | Date | null): string {
  if (!value) return '';
  const raw = typeof value === 'string' ? value.trim() : value;
  if (!raw) return '';
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  return typeof value === 'string' ? value.trim() : '';
}


export async function apiWithAuth<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('Not signed in');
  return apiFetch<T>(path, options, token);
}
