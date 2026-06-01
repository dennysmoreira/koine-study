import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';

export const metadata: Metadata = {
  title: 'Koiné Study',
  description: 'Plataforma de estudo de grego koiné para exegese bíblica.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Koiné Study',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      {/* pb reserva espaço para a BottomNav fixa (3.5rem) + safe-area do iOS. */}
      <body className="min-h-dvh pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
