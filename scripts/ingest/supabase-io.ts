/**
 * Helpers compartilhados de escrita no Supabase para os scripts de ingestão.
 * Extraído para evitar duplicação entre index.ts (load) e reload.ts (reload).
 *
 * `client: any` — scripts operam com tabelas dinâmicas (string), sem o tipo do
 * schema gerado; o cast localiza o `any` num único lugar.
 */

type Row = Record<string, unknown>;

/** Insere `rows` em lotes de `size`, com progresso na mesma linha. */
export async function insertBatched(client: any, table: string, rows: Row[], size: number): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await client.from(table).insert(rows.slice(i, i + size));
    if (error) throw new Error(`${table} [linha ${i}]: ${error.message}`);
    process.stdout.write(`\r  ${table}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
}

/**
 * DELETE de todas as linhas (PostgREST exige um filtro). Usa `id is not null`,
 * que vale para qualquer tipo de PK (bigint identity OU uuid) — diferente de
 * `gt('id', 0)`, que assume PK inteira positiva.
 */
export async function deleteAll(client: any, table: string): Promise<void> {
  const { error } = await client.from(table).delete().not('id', 'is', null);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  console.log(`  ${table}: limpo`);
}

/**
 * Mapa `strongs -> [lemma_id...]` do corpus carregado. Paginado porque ~9k lemas
 * excedem o limite default do PostgREST. Um Strong's pode mapear vários lemas
 * (homógrafos), daí o array. Usado para resolver chaves estáveis (Strong's) aos
 * ids sintéticos voláteis de `lemmas` ao aplicar léxicos em `lexicon_entries`.
 */
export async function lemmaIdsByStrongs(client: any): Promise<Map<string, number[]>> {
  const byStrongs = new Map<string, number[]>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('lemmas').select('id,strongs').order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`ler lemmas: ${error.message}`);
    const rows = (data ?? []) as Array<{ id: number; strongs: string | null }>;
    for (const r of rows) {
      if (!r.strongs) continue;
      const arr = byStrongs.get(r.strongs);
      if (arr) arr.push(r.id); else byStrongs.set(r.strongs, [r.id]);
    }
    if (rows.length < PAGE) break;
  }
  return byStrongs;
}
