import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hermeneus',
    short_name: 'Hermeneus',
    description: 'Leitura e exegese do texto bíblico no original — grego e hebraico.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    lang: 'pt-BR',
    // TODO: adicionar icons 192x192 e 512x512 para instalabilidade PWA completa.
    icons: [],
  };
}
