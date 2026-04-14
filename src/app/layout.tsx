import type { Metadata } from 'next';
import { Geist, Geist_Mono, Inter_Tight } from 'next/font/google';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
});

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'LuxWeb Studio — Portal',
  description: 'Client portal and internal CRM for LuxWeb Studio.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${interTight.variable} ${geistMono.variable}`}
    >
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
