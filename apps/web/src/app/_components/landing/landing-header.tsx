'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BrandLogo } from '@/app/_components/brand-logo';

const navLinks = [
  { href: '#overview', label: 'Overview' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#platforms', label: 'Platforms' },
  { href: '#login', label: 'Login' },
  { href: '#contact', label: 'Contact' },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-[background,box-shadow,border-color,backdrop-filter] duration-300 ease-soft"
      style={
        scrolled
          ? {
              borderBottom: '1px solid var(--rs-border)',
              background: 'color-mix(in srgb, var(--rs-surface) 94%, transparent)',
              boxShadow: 'var(--rs-shadow)',
              backdropFilter: 'blur(10px)',
            }
          : {
              background: 'color-mix(in srgb, var(--rs-header) 55%, transparent)',
              backdropFilter: 'blur(14px)',
              borderBottom: '1px solid color-mix(in srgb, var(--rs-header-ink) 12%, transparent)',
              color: 'var(--rs-header-ink)',
            }
      }
    >
      <div className="mx-auto flex h-16 w-[95%] items-center justify-between gap-6">
        <a
          href="#"
          className="inline-flex shrink-0 items-center transition-transform duration-300 ease-soft hover:scale-[1.02]"
        >
          <BrandLogo size="md" light={!scrolled} />
        </a>

        <nav className="hidden min-w-0 items-center md:flex" aria-label="Primary">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rs-nav-link inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  style={{
                    color: scrolled
                      ? 'var(--rs-muted)'
                      : 'color-mix(in srgb, var(--rs-header-ink) 82%, transparent)',
                  }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href="/login"
            className="rs-cta ml-4 inline-flex h-10 shrink-0 items-center rounded-xl px-5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={
              scrolled
                ? {
                    background: 'var(--rs-accent)',
                    color: 'var(--rs-on-accent)',
                    boxShadow: 'var(--rs-shadow)',
                  }
                : {
                    background: 'var(--rs-surface)',
                    color: 'var(--rs-accent)',
                    boxShadow: '0 8px 24px color-mix(in srgb, black 30%, transparent)',
                  }
            }
          >
            Sign in
          </Link>
        </nav>

        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-all duration-200 hover:scale-105 md:hidden"
          style={
            scrolled
              ? {
                  borderColor: 'var(--rs-border)',
                  background: 'var(--rs-surface)',
                  color: 'var(--rs-ink)',
                }
              : {
                  borderColor: 'color-mix(in srgb, var(--rs-header-ink) 22%, transparent)',
                  background: 'color-mix(in srgb, var(--rs-header-ink) 10%, transparent)',
                  color: 'var(--rs-header-ink)',
                }
          }
        >
          <span className="sr-only">Menu</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5 transition-transform duration-300" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? (
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen ? (
        <div
          className="animate-menu-in border-t px-5 py-4 sm:px-6 md:hidden"
          style={{
            borderColor: 'var(--rs-border)',
            background: 'var(--rs-surface)',
          }}
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {navLinks.map((link, i) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 hover:translate-x-1 hover:bg-brand-light hover:text-brand"
                style={{
                  color: 'var(--rs-ink)',
                  animationDelay: `${i * 40}ms`,
                }}
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="rs-cta mt-3 rounded-xl px-4 py-3 text-center text-sm font-semibold"
              style={{
                background: 'var(--rs-accent)',
                color: 'var(--rs-on-accent)',
              }}
            >
              Sign in
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
