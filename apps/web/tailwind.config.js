/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}', '../../packages/ui/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--rs-accent)',
          dark: 'var(--rs-accent-hover)',
          light: 'var(--rs-accent-soft)',
          on: 'var(--rs-on-accent)',
        },
        accent: {
          DEFAULT: 'var(--rs-accent-secondary)',
          dark: 'var(--rs-accent-hover)',
          light: 'var(--rs-accent-soft)',
        },
        rs: {
          bg: 'var(--rs-bg)',
          deep: 'var(--rs-bg-deep)',
          surface: 'var(--rs-surface)',
          'surface-2': 'var(--rs-surface-2)',
          ink: 'var(--rs-ink)',
          muted: 'var(--rs-muted)',
          border: 'var(--rs-border)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        devanagari: ['var(--font-devanagari)', 'sans-serif'],
      },
      animation: {
        'hero-fade-up': 'heroFadeUp 0.9s ease-out forwards',
        'atmosphere-drift': 'atmosphereDrift 18s ease-in-out infinite alternate',
        'reveal-up': 'revealUp 0.7s ease-out forwards',
        'reveal-scale': 'revealScale 0.75s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'soft-float': 'softFloat 7s ease-in-out infinite',
        'accent-sheen': 'accentSheen 4.5s ease-in-out infinite',
        'menu-in': 'menuIn 0.28s ease-out forwards',
        'toast-in': 'toastIn 0.22s ease-out',
        'toast-progress': 'toastProgress linear forwards',
        'loader-pulse': 'loaderPulse 1.6s ease-in-out infinite',
        'loader-breathe': 'loaderBreathe 1.8s ease-in-out infinite',
        'fab-breathe': 'fabBreathe 2.4s ease-in-out infinite',
      },
      keyframes: {
        heroFadeUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        atmosphereDrift: {
          '0%': { transform: 'scale(1.02) translateX(0)' },
          '100%': { transform: 'scale(1.06) translateX(-1.5%)' },
        },
        revealUp: {
          '0%': { opacity: '0', transform: 'translateY(32px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        revealScale: {
          '0%': { opacity: '0', transform: 'translateY(20px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        softFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        accentSheen: {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.08)' },
        },
        menuIn: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        toastIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        toastProgress: {
          '0%': { transform: 'scaleX(1)' },
          '100%': { transform: 'scaleX(0)' },
        },
        loaderPulse: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(0.96)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        loaderBreathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
        },
        fabBreathe: {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 10px 25px -5px rgb(15 118 110 / 0.35)' },
          '50%': { transform: 'scale(1.06)', boxShadow: '0 16px 32px -6px rgb(15 118 110 / 0.45)' },
        },
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
