/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @react-pdf/renderer (usado no route handler de export PDF) deve rodar como
  // dependência externa do servidor, não ser empacotado pelo bundler — evita
  // erros de resolução dos seus módulos nativos/CJS no build do Next.
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
  },
};

export default nextConfig;
