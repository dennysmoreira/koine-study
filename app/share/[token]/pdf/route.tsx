import { renderToBuffer } from '@react-pdf/renderer';
import { getPublicSnapshot } from '@/lib/shared-studies';
import { SnapshotPdf } from '@/components/pdf/SnapshotPdf';

// @react-pdf/renderer precisa do runtime Node (não edge); conteúdo é por-token.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Nome de arquivo seguro (ASCII) a partir do título, para o Content-Disposition.
function safeFilename(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // remove marcas diacríticas combinantes (acentos)
    .replace(/[^\w.\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'hermeneus'}.pdf`;
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const result = await getPublicSnapshot(params.token);
  if (!result) return new Response('Não encontrado', { status: 404 });

  const buffer = await renderToBuffer(
    <SnapshotPdf snapshot={result.snapshot} snapshotAt={result.snapshotAt} />,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFilename(result.snapshot.title)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
