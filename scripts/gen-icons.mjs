import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

// Gera os ícones PWA (artefato de build: o sharp é instalado com --no-save só para
// isto; os PNGs resultantes ficam versionados em public/icons).
// Marca: fundo escuro full-bleed (#0a0a0a) + "Ω" âmbar (#f59e0b) centralizada —
// full-bleed é seguro tanto para "any" quanto "maskable" (glifo na zona segura).
mkdirSync('public/icons', { recursive: true });

const svg = (size, glyphRatio) => {
  const fs = Math.round(size * glyphRatio);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0a0a0a"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', 'DejaVu Serif', serif" font-weight="700"
    font-size="${fs}" fill="#f59e0b">&#937;</text>
</svg>`;
};

async function render(name, size, glyphRatio) {
  await sharp(Buffer.from(svg(size, glyphRatio))).png().toFile(`public/icons/${name}`);
  console.log('ok', name);
}

await render('icon-192.png', 192, 0.62);
await render('icon-512.png', 512, 0.62);
await render('icon-maskable-512.png', 512, 0.52);
await render('apple-touch-icon.png', 180, 0.6);
