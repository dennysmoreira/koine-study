import { permanentRedirect } from 'next/navigation';

// Unificado no comparador: redireciona o capítulo para /compare já com o grego
// original selecionado (`?v=grc-sblgnt`), onde a coluna do grego é o interlinear
// clicável. 308 permanente preserva links antigos do leitor.
export default function ReadChapterPage({ params }: { params: { book: string; chapter: string } }) {
  const osis = encodeURIComponent(decodeURIComponent(params.book));
  permanentRedirect(`/compare/${osis}/${params.chapter}?v=grc-sblgnt`);
}
