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
