import type { Metadata, Viewport } from 'next';
import { Gentium_Plus, Frank_Ruhl_Libre } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

// Grego do NT é politonico (espiritos, tres acentos, iota subscrito): o subset
// 'greek-ext' (bloco Unicode Greek Extended) e obrigatorio. Gentium Plus posiciona
// os diacriticos empilhados corretamente — fontes de sistema nao cobrem bem.
const greek = Gentium_Plus({
  subsets: ['latin', 'greek', 'greek-ext'],
  weight: ['400', '700'],
  variable: '--font-greek',
  display: 'swap',
});

// Hebraico biblico e apontado (niqqud). Frank Ruhl Libre e serifada tradicional
// com suporte a vocalizacao. Cantilacao (te'amim) completa pede SBL Hebrew/Taamey
// Frank CLM self-hosted — follow-up registrado em docs/design-review.md.
const hebrew = Frank_Ruhl_Libre({
  subsets: ['latin', 'hebrew'],
  weight: ['400', '500', '700'],
  variable: '--font-hebrew',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hermeneus',
  description: 'Leitura e exegese do texto bíblico no original — grego e hebraico.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Hermeneus',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // iOS usa o apple-touch-icon ao "Adicionar à Tela de Início".
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
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
    <html lang="pt-BR" className={`${greek.variable} ${hebrew.variable}`}>
      {/* O AppShell reserva o espaço da BottomNav só onde ela aparece. */}
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
