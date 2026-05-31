import { permanentRedirect } from 'next/navigation';

// O leitor interlinear foi unificado no comparador (/compare): a coluna do grego
// já é interlinear clicável (tokens → definição). /read virou um 308 permanente
// para preservar links antigos e o histórico/SEO.
export default function ReadIndexPage() {
  permanentRedirect('/compare');
}
