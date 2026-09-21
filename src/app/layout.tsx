import type { Metadata } from 'next';
import './globals.css';
import { ThemeScript } from '@/components/theme';
import { BRAND_NAME, DESCRIPTION, TAGLINE } from '@/lib/brand';

export const metadata: Metadata = {
  title: { default: `${BRAND_NAME} - ${TAGLINE}`, template: `%s · ${BRAND_NAME}` },
  description: DESCRIPTION,
  applicationName: BRAND_NAME,
  openGraph: { title: BRAND_NAME, description: TAGLINE, siteName: BRAND_NAME, type: 'website' },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <ThemeScript />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
