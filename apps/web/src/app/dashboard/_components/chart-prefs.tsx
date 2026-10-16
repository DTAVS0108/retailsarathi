/** Tiny localStorage-backed preference helpers shared by every chart widget that lets the user
    toggle chart type / period / metric and expects that choice to stick around. */

export function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v && (allowed as readonly string[]).includes(v)) return v as T;
  } catch {
    // localStorage unavailable (private browsing, disabled storage) — fall back silently
  }
  return fallback;
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // persistence is a nice-to-have, not required for the chart to function
  }
}
