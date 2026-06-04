/**
 * Formato CANÔNICO do `ref` de um versículo, como gravado em `verse_texts.ref` e
 * em `study_references.ref`: "{osis} {chapter}:{verse}" (ex.: "John 3:16"). É o
 * que a ingestão do corpus grava e o que o comparador cita ao adicionar versículos
 * a um estudo.
 *
 * Centralizar a construção aqui evita que produtores divirjam no formato — uma
 * divergência (ex.: "John.3.16" × "John 3:16") quebraria o `unique(study_id, ref)`
 * e duplicaria citações do mesmo versículo entre pontos de entrada diferentes.
 */
export function verseRef(osis: string, chapter: number, verse: number): string {
  return `${osis} ${chapter}:${verse}`;
}
