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
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    lang: 'pt-BR',
    categories: ['books', 'education', 'reference'],
    icons: [
      // "any": ícones exibidos como estão (o SO pode arredondar). "maskable":
      // full-bleed com zona segura, para o SO aplicar a própria máscara/forma.
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
