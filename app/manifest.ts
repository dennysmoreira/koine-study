import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Hermeneus',
    short_name: 'Hermeneus',
    description: 'Leitura e exegese do texto bíblico no original — grego e hebraico.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Fallback: se 'standalone' não for suportado, cai para minimal-ui (com nav
    // mínima) antes do browser. Melhora a experiência de janela no desktop.
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['books', 'education', 'reference'],
    // Atalhos do app: no Windows aparecem no menu de clique-direito do ícone na
    // barra de tarefas / Menu Iniciar (jump list); no Android, no long-press.
    shortcuts: [
      { name: 'Ler & comparar', short_name: 'Ler', url: '/compare', description: 'Abrir o leitor interlinear' },
      { name: 'Buscar', short_name: 'Buscar', url: '/search', description: 'Buscar versículos por palavra ou referência' },
      { name: 'Dicionário', short_name: 'Dicionário', url: '/dictionary', description: 'Buscar qualquer palavra do NT' },
      { name: 'Estudos salvos', short_name: 'Estudos', url: '/studies', description: 'Seus estudos gerados com IA' },
    ],
    icons: [
      // "any": ícones exibidos como estão (o SO pode arredondar). "maskable":
      // full-bleed com zona segura, para o SO aplicar a própria máscara/forma.
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
