import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

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
      {/* O AppShell reserva o espaço da BottomNav só onde ela aparece. */}
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
