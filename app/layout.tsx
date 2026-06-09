import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Hermeneus',
  description: 'Leitura e exegese do texto bíblico no original — grego e hebraico.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Hermeneus',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  // Não travar zoom: o usuário precisa dar pinch-zoom para ler grego/hebraico
  // miúdo e o interlinear (WCAG 1.4.4 — não desabilitar zoom).
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
