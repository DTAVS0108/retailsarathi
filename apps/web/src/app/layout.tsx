import type { Metadata, Viewport } from 'next';
import { Fraunces, Noto_Sans_Devanagari, Plus_Jakarta_Sans } from 'next/font/google';
import { getWebAppearanceInlineScript } from '@/lib/appearance-prefs';
import { SITE_URL } from '@/lib/site';
import { AppearanceBootstrap } from './_components/appearance-bootstrap';
import { ConfirmProvider } from './_components/confirm-dialog';
import { ToastProvider } from './_components/toast';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '600'],
  variable: '--font-devanagari',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL),
  title: 'RetailSarathi — Retail Management for Indian Shops',
  description: 'Inventory, billing, GST, repairs, and more for electronics retailers',
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'RetailSarathi',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#EA580C',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${devanagari.variable} rs-themed`} suppressHydrationWarning>
      <head>
        {/* Apply saved theme before paint — persists across home / login / dashboard / admin */}
        <script dangerouslySetInnerHTML={{ __html: getWebAppearanceInlineScript() }} />
      </head>
      <body className="min-h-dvh antialiased" style={{ background: 'var(--rs-bg)', color: 'var(--rs-ink)' }}>
        <AppearanceBootstrap />
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
