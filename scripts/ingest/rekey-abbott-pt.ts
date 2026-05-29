/**
 * One-off: re-chaveia os caches PT (Abbott-Smith e glosas curtas) de
 * `old lemma id` -> `Strong's`.
 *
 * Contexto: o pivot SBLGNT (ADR-001) reatribuiu lemmas.id (identity volátil) e o
 * reload reescreveu lemmas.abbott_smith/gloss_pt com o build (EN/nulo), perdendo as
 * traduções PT no banco. Os caches data/build/{abbott,lemmas}.pt.json sobreviveram,
 * mas estavam chaveados pelo id antigo (sequencial sobre a ordem do Dodson). Como
 * `parseDodson` é determinístico, reconstruímos old_id -> strongs (mesmo ++id de
 * `parseLemmas`) e regravamos os caches chaveados por Strong's — chave estável e
 * independente de rebuilds.
 *
 * DRY-RUN por padrão (só valida e relata). Com `--write` regrava os caches chaveados
 * por Strong's (faz backup de <file>.json -> <file>.byid.json antes). Idempotente:
 * caches já chaveados por Strong's (chaves "G####") são pulados.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseDodson } from './dodson.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES = join(ROOT, 'data', 'sources');
const BUILD = join(ROOT, 'data', 'build');
const DODSON_CSV = join(SOURCES, 'dodson', 'dodson.csv');
const DODSON_XML = join(SOURCES, 'dodson', 'dodson.xml');

// Âncoras de sanidade espalhadas pelo intervalo de Strong's: se o old_id->strongs
// derivou errado (dodson.csv mudou de ordem/linhas), ao menos uma âncora falha.
// Conteúdo em PT (os caches são traduções), por isso casamos termos PT.
const ANCHORS: Array<{ strongs: string; needle: RegExp }> = [
  { strongs: 'G2316', needle: /Deus/i },      // θεός
  { strongs: 'G5547', needle: /Cristo|ungido/i }, // Χριστός
  { strongs: 'G2962', needle: /Senhor/i },    // κύριος
];

const TARGETS = [
  { file: 'abbott.pt.json', label: 'Abbott-Smith' },
  { file: 'lemmas.pt.json', label: 'glosas curtas' },
];

// reconstrói old_id -> strongs: MESMA ordem/contador de parseLemmas (++id sobre parseDodson.values())
function buildIdToStrongs(): Map<number, string> {
  const dodson = parseDodson(DODSON_CSV, DODSON_XML);
  const idToStrongs = new Map<number, string>();
  let id = 0;
  for (const d of dodson.values()) idToStrongs.set(++id, d.strongs);
  return idToStrongs;
}

function rekeyFile(file: string, label: string, idToStrongs: Map<number, string>, write: boolean): void {
  const path = join(BUILD, file);
  if (!existsSync(path)) { console.log(`\n[${label}] ${file} ausente — pulado.`); return; }
  const cache: Record<string, string> = JSON.parse(readFileSync(path, 'utf8'));
  const keys = Object.keys(cache);

  console.log(`\n── ${label} (${file}) ──`);
  console.log(`entradas: ${keys.length}, chaves de amostra: ${keys.slice(0, 5).join(', ')}`);

  // idempotência: já chaveado por Strong's? (checa TODAS as chaves; detecta cache misto)
  const strongsKeys = keys.filter((k) => /^G\d/.test(k));
  if (strongsKeys.length === keys.length) {
    console.log('já chaveado por Strong\'s (chaves "G####") — pulado.');
    return;
  }
  if (strongsKeys.length > 0) {
    throw new Error(`[${label}] cache MISTO (${strongsKeys.length} chaves por Strong's, ${keys.length - strongsKeys.length} por id) — estado inconsistente; restaure de ${file.replace(/\.json$/, '.byid.json')}.`);
  }

  const byStrongs: Record<string, string> = {};
  let mapped = 0, orphan = 0, collision = 0;
  const orphans: string[] = [];
  for (const [oldId, text] of Object.entries(cache)) {
    const strongs = idToStrongs.get(Number(oldId));
    if (!strongs) { orphan++; orphans.push(oldId); continue; }
    if (strongs in byStrongs) collision++;
    byStrongs[strongs] = text;
    mapped++;
  }

  // âncoras de sanidade: se alguma falhar, o mapeamento derivou errado.
  const failed: string[] = [];
  for (const a of ANCHORS) {
    const v = byStrongs[a.strongs];
    const ok = v != null && a.needle.test(v);
    console.log(`âncora ${a.strongs} ${a.needle}: ${v ? '"' + v.slice(0, 40) + '..."' : 'AUSENTE'}  ${ok ? '✓' : '⚠'}`);
    if (!ok) failed.push(a.strongs);
  }
  console.log(`mapeados: ${mapped}  órfãos: ${orphan}  colisões: ${collision}  resultantes: ${Object.keys(byStrongs).length}`);
  if (orphans.length) console.log(`órfãos (primeiros 20): ${orphans.slice(0, 20).join(', ')}`);

  if (failed.length > 0) {
    throw new Error(`[${label}] ${failed.length} âncora(s) falharam (${failed.join(', ')}) — dodson.csv pode ter mudado de ordem/linhas; abortando para evitar corrupção. Nada foi escrito.`);
  }

  if (!write) { console.log('DRY-RUN: nada escrito.'); return; }

  copyFileSync(path, path.replace(/\.json$/, '.byid.json'));
  writeFileSync(path, JSON.stringify(byStrongs), 'utf8');
  console.log(`regravado por Strong's (backup .byid.json).`);
}

// aplica um cache PT (chaveado por Strong's) numa coluna de public.lemmas, por Strong's.
// UPDATE idempotente — restaura a tradução perdida no reload sem custo de LLM.
async function applyToDb(file: string, column: 'abbott_smith' | 'gloss_pt', label: string): Promise<void> {
  const path = join(BUILD, file);
  if (!existsSync(path)) { console.log(`\n[${label}] ${file} ausente — pulado.`); return; }
  const cache: Record<string, string> = JSON.parse(readFileSync(path, 'utf8'));
  const keys = Object.keys(cache);
  if (!keys.some((k) => /^G\d/.test(k))) {
    throw new Error(`[${label}] ${file} não está chaveado por Strong's — rode --write antes do --apply.`);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const entries = Object.entries(cache).filter(([, text]) => text); // pula vazios
  console.log(`\n[${label}] aplicando ${entries.length} entradas em lemmas.${column} (por Strong's)...`);

  // concorrência limitada
  let i = 0, applied = 0, missing = 0;
  const LIMIT = 8;
  await Promise.all(Array.from({ length: LIMIT }, async () => {
    while (i < entries.length) {
      const cur = entries[i++];
      if (!cur) continue;
      const [strongs, text] = cur;
      // retry em falhas transientes de rede (fetch failed/timeout)
      let data: unknown[] | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await (db.from('lemmas') as any)
            .update({ [column]: text }).eq('strongs', strongs).select('id');
          if (res.error) throw new Error(res.error.message);
          data = res.data;
          break;
        } catch (e) {
          if (attempt >= 4) throw new Error(`update ${strongs}: ${(e as Error).message}`);
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
      if (!data || data.length === 0) missing++; else applied++;
      if ((applied + missing) % 200 === 0) process.stdout.write(`\r  ${applied + missing}/${entries.length}`);
    }
  }));
  process.stdout.write('\n');
  console.log(`[${label}] aplicados: ${applied}  sem lema correspondente no corpus (Strong's ausente): ${missing}`);
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const apply = process.argv.includes('--apply');

  if (apply) {
    await applyToDb('abbott.pt.json', 'abbott_smith', 'Abbott-Smith');
    await applyToDb('lemmas.pt.json', 'gloss_pt', 'glosas curtas');
    console.log('\nRestauração concluída. Invalide o Data Cache do Next (.next/cache).');
    return;
  }

  const idToStrongs = buildIdToStrongs();
  console.log(`reconstruído: ${idToStrongs.size} lemas Dodson (old_id 1..${idToStrongs.size})`);
  for (const t of TARGETS) rekeyFile(t.file, t.label, idToStrongs, write);
  if (!write) console.log('\nReexecute com `--write` para regravar; depois `--apply` para restaurar no banco.');
}

main().catch((e) => { console.error(e); process.exit(1); });
