/**
 * Verificação rápida (Fase I) da stack de léxicos no Supabase ao vivo.
 * Uso: tsx scripts/ingest/verify-lexicon.ts
 *
 * Confere: (1) contagem de lexicon_entries; (2) o join por Strong's de θεός
 * (G2316) retorna a entrada LSJ; (3) cobertura de lemas do corpus.
 * Read-only — nenhuma escrita.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  const client = createClient(url, key, { auth: { persistSession: false } });

  // 1. contagem total de lexicon_entries
  const { count: lexCount, error: e1 } = await client
    .from('lexicon_entries')
    .select('*', { count: 'exact', head: true });
  if (e1) throw new Error(`lexicon_entries count: ${e1.message}`);
  console.log(`lexicon_entries: ${lexCount} linhas`);

  // 2. join por Strong's de θεός (G2316)
  const { data: theos, error: e2 } = await client
    .from('lexicon_entries')
    .select('source,text_en,text_pt,sort_order,lemmas!inner(strongs,lemma,gloss_pt)')
    .eq('lemmas.strongs', 'G2316')
    .order('sort_order')
    .order('source');
  if (e2) throw new Error(`join θεός: ${e2.message}`);
  const sources = [...new Set((theos ?? []).map((r: any) => r.source))];
  const lsj = (theos ?? []).find((r: any) => r.source === 'lsj') as any;
  console.log(`\nθεός (G2316): ${theos?.length ?? 0} linhas; fontes: ${sources.join(', ') || '(nenhuma)'}`);
  if (lsj) {
    const txt = (lsj.text_pt ?? lsj.text_en ?? '') as string;
    console.log(`  lema: ${lsj.lemmas?.lemma} | gloss_pt: ${lsj.lemmas?.gloss_pt}`);
    console.log(`  LSJ (${txt.length} chars): ${txt.slice(0, 160).replace(/\n/g, ' ⏎ ')}…`);
  } else {
    console.log('  ⚠️  sem entrada LSJ para θεός');
  }

  // 3. cobertura: lemas distintos com ao menos uma entrada de léxico
  const { count: lemmaCount, error: e4 } = await client
    .from('lemmas')
    .select('*', { count: 'exact', head: true });
  if (e4) throw new Error(`lemmas count: ${e4.message}`);
  console.log(`lemmas: ${lemmaCount} (corpus)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
