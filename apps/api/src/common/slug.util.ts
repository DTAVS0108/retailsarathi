/**
 * Kebab-case a name into a URL-safe slug, e.g. "Tyagi Electric Works" -> "tyagi-electric-works".
 * Returns '' if the input has no alphanumeric characters at all — callers decide whether that's
 * an error (user-edited value) or should fall back to something (auto-generated at creation).
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Find a slug that doesn't collide, appending -2, -3, ... as needed. */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || 'shop';
  let candidate = root;
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
}
