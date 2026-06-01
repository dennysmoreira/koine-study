/**
 * Ingestao do lexico BDB (Brown-Driver-Briggs) hebraico na coluna
 * `lemmas.bdb_def`, chaveado por Strong's "H####".
 *
 * O Strong's (1890) da apenas uma glosa curta; o BDB e o melhor lexico academico
 * de hebraico biblico em dominio publico (CC BY 4.0 nesta digitalizacao). Aqui
 * enriquecemos cada lema hebraico com a definicao BDB concisa para o painel da
 * palavra no interlinear do AT.
 *
 * Fonte: openscriptures/HebrewLexicon (mesma org do morphhb/strongs ja usados):
 *   - LexicalIndex.xml       -> ponte Strong's <-> id BDB (<xref strong="N" bdb="x.y.z"/>)
 *   - BrownDriverBriggs.xml  -> artigos BDB keyados pelo id (a.ae.ab ...)
 *
 * O artigo BDB inteiro e enorme e cheio de referencias biblicas (ruido para um
 * painel mobile). Por isso extraimos so as glosas <def> (os significados), na
 * ordem do artigo e deduplicadas — uma "definicao" rica mas legivel. O Strong's
 * curto continua inline; o BDB e a definicao secundaria mais profunda.
 *
 * O numero Strong's no LexicalIndex vem CRU ("1", nao "H1") — prefixamos "H" para
 * casar com `lemmas.strongs`. Idempotente: atualiza a coluna por (lemma, strongs).
 */

import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = join(ROOT, 'data', 'sources', 'hebrew-lexicon');
const RAW_BASE = 'https://raw.githubusercontent.com/openscriptures/HebrewLexicon/master';
const FILES = {
  index: { url: `${RAW_BASE}/LexicalIndex.xml`, path: join(CACHE_DIR, 'LexicalIndex.xml') },
  bdb: { url: `${RAW_BASE}/BrownDriverBriggs.xml`, path: join(CACHE_DIR, 'BrownDriverBriggs.xml') },
};

/** Baixa o XML (cacheando em data/sources/) ou le do cache se ja presente. */
async function loadXml(file: { url: string; path: string }): Promise<string> {
  if (existsSync(file.path)) return readFileSync(file.path, 'utf8');
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${file.url}`);
  const xml = await res.text();
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file.path, xml, 'utf8');
  return xml;
}

/** Remove tags, decodifica entidades XML basicas e colapsa espacos. */
function clean(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Le o LexicalIndex e devolve o mapa Strong's canonico ("H####") -> id BDB.
 * A ordem dos atributos de <xref> varia (bdb vem antes de strong), entao
 * extraimos cada atributo separadamente. Primeira ocorrencia vence (homografos).
 */
function buildStrongToBdb(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const xrefRe = /<xref\b([^>]*?)\/?>/g;
  for (let m = xrefRe.exec(xml); m !== null; m = xrefRe.exec(xml)) {
    const attrs = m[1] ?? '';
    const strong = /\bstrong="(\d+)"/.exec(attrs);
    const bdb = /\bbdb="([^"]+)"/.exec(attrs);
    if (!strong || !bdb) continue;
    const key = `H${strong[1]}`;
    if (!map.has(key)) map.set(key, bdb[1]!);
  }
  return map;
}

/**
 * Le o BrownDriverBriggs e devolve o mapa id BDB -> definicao concisa: as glosas
 * <def> do artigo, na ordem em que aparecem, deduplicadas (case-insensitive),
 * unidas por "; ". Artigos sem <def> (raizes, nomes proprios) ficam de fora.
 */
function buildBdbDefs(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const entryRe = /<entry id="([^"]+)"[^>]*>([\s\S]*?)<\/entry>/g;
  for (let m = entryRe.exec(xml); m !== null; m = entryRe.exec(xml)) {
    const id = m[1];
    if (!id) continue;
    const body = m[2] ?? '';
    const defs: string[] = [];
    const seen = new Set<string>();
    const defRe = /<def>([\s\S]*?)<\/def>/g;
    for (let d = defRe.exec(body); d !== null; d = defRe.exec(body)) {
      const text = clean(d[1] ?? '');
      const lower = text.toLowerCase();
      if (text && !seen.has(lower)) {
        seen.add(lower);
        defs.push(text);
      }
    }
    if (defs.length > 0) map.set(id, defs.join('; '));
  }
  return map;
}

export async function ingestHebrewBdb(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');

  console.log('baixando lexico BDB (openscriptures/HebrewLexicon)...');
  const [indexXml, bdbXml] = await Promise.all([loadXml(FILES.index), loadXml(FILES.bdb)]);

  const strongToBdb = buildStrongToBdb(indexXml);
  const bdbDefs = buildBdbDefs(bdbXml);
  console.log(`  ponte Strong's->BDB: ${strongToBdb.size} | artigos BDB com definicao: ${bdbDefs.size}`);

  const client = createClient(url, key, { auth: { persistSession: false } });

  // Le os lemas hebraicos ja presentes (strongs "H####") para atualizar a coluna
  // por (lemma, strongs). Mantemos lemma+strongs no payload do upsert para o
  // caminho de UPDATE preservar as colunas NOT NULL sem reinserir nada.
  const updates: Array<{ id: number; lemma: string; strongs: string; bdb_def: string }> = [];
  const PAGE = 1000;
  let scanned = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('lemmas')
      .select('id,lemma,strongs')
      .like('strongs', 'H%')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`ler lemmas: ${error.message}`);
    const page = (data ?? []) as Array<{ id: number; lemma: string; strongs: string | null }>;
    for (const r of page) {
      scanned++;
      if (!r.strongs) continue;
      const bdbId = strongToBdb.get(r.strongs);
      const def = bdbId ? bdbDefs.get(bdbId) : undefined;
      if (def) updates.push({ id: r.id, lemma: r.lemma, strongs: r.strongs, bdb_def: def });
    }
    if (page.length < PAGE) break;
  }
  console.log(`  lemas hebraicos: ${scanned} | com definicao BDB: ${updates.length}`);
  if (updates.length === 0) {
    throw new Error('nenhuma definicao BDB casou — rode ingest:hebrew-lexicon antes (lemas hebraicos ausentes)?');
  }

  const SIZE = 500;
  let applied = 0;
  for (let i = 0; i < updates.length; i += SIZE) {
    const batch = updates.slice(i, i + SIZE);
    const { error } = await client.from('lemmas').upsert(batch, { onConflict: 'lemma,strongs' });
    if (error) throw new Error(`upsert lemmas (bdb) @${i}: ${error.message}`);
    applied += batch.length;
    process.stdout.write(`\r  bdb_def: ${applied}/${updates.length}`);
  }
  process.stdout.write('\n');
  console.log(`Definicoes BDB carregadas em public.lemmas.bdb_def (${applied} lemas).`);
}
