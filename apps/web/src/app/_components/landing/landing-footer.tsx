import Link from 'next/link';
import { BrandLogo } from '@/app/_components/brand-logo';

const moduleLinks = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Billing & POS' },
  { href: '#features', label: 'Stock & IMEI' },
  { href: '#platforms', label: 'Desktop · Web · Mobile' },
  { href: '#overview', label: 'Overview' },
  { href: '#login', label: 'Login' },
];

export function LandingFooter() {
  return (
    <footer
      className="border-t"
      style={{
        borderColor: 'color-mix(in srgb, var(--rs-header-ink) 16%, transparent)',
        background: 'var(--rs-header)',
        color: 'var(--rs-header-ink)',
      }}
    >
      <div className="mx-auto w-[80%] py-12 lg:py-14">
        <div className="grid items-start gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-20">
          <div className="min-w-0">
            <BrandLogo size="lg" light />
            <p
              className="mt-4 max-w-md text-sm leading-relaxed"
              style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 82%, transparent)' }}
            >
              Offline-capable retail software for Indian electronics and mobile shops — billing,
              stock, GST, repairs, and wholesale in one trusted companion.
            </p>
          </div>

          <div className="min-w-0 sm:justify-self-end sm:text-left lg:max-w-sm lg:w-full">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em]"
              style={{
                color: 'color-mix(in srgb, var(--rs-accent-secondary) 45%, var(--rs-header-ink))',
              }}
            >
              Modules
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
              {moduleLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="rs-link-slide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 90%, transparent)' }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="rs-link-slide mt-6 inline-flex text-sm font-semibold"
              style={{
                color: 'color-mix(in srgb, var(--rs-accent-secondary) 40%, var(--rs-header-ink))',
              }}
            >
              Sign in →
            </Link>
          </div>
        </div>

        <div
          className="mt-10 flex flex-col gap-3 border-t pt-6 text-sm sm:mt-12 sm:flex-row sm:items-center sm:justify-between"
          style={{
            borderColor: 'color-mix(in srgb, var(--rs-header-ink) 16%, transparent)',
          }}
        >
          <p style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 72%, transparent)' }}>
            © 2026 RetailSarathi. Built for Indian retailers.
          </p>
          <a
            href="mailto:hello@retailsarathi.in"
            className="transition hover:opacity-100"
            style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 78%, transparent)' }}
          >
            hello@retailsarathi.in
          </a>
        </div>
      </div>
    </footer>
  );
}
