import type { Metadata } from 'next';
import './globals.css';
import { ThemeScript, ThemeToggle } from '@/components/theme';

export const metadata: Metadata = {
  title: 'Encore — book live entertainment',
  description:
    'A two-sided marketplace connecting restaurants and hotels with entertainers: searchable profiles, live availability and published rates.',
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
        <ThemeToggle />
      </body>
    </html>
  );
}
