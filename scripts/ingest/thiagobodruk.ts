/**
 * Ingestão automática de versões PT-BR a partir do repo thiagobodruk/bible.
 *
 * Diferente de `ingest-version-file` (que só CARREGA um arquivo local que você
 * já possui), este passo BAIXA o JSON do repositório público thiagobodruk/bible
 * e o converte+carrega num só comando — cobrindo AT + NT (66 livros).
 *
 * ATENÇÃO — DIREITOS AUTORAIS: o repositório thiagobodruk agrega versões de
 * DOMÍNIO PÚBLICO e também versões PROTEGIDAS (NVI © Biblica, ACF © SBTB, etc.).
 * Baixar/redistribuir versões protegidas exige licença do detentor dos direitos.
 * Os metadados abaixo declaram o detentor honestamente; o uso é de sua
 * responsabilidade. O gargalo nunca foi técnico, e sim jurídico.
 *
 * Fluxo (por versão):
 *   1) baixa json/<file>.json (UTF-8 com BOM) do raw.githubusercontent
 *   2) converte com convertBook (AT+NT, mapeamento de abreviações em bible-json)
 *   3) grava data/versions/<code>.json (inspecionável + reaproveita o loader)
 *   4) carrega via ingestVersionFromFile (upsert idempotente por translation_code,ref)
 *
 * É um Adapter de fonte: encapsula o download e delega a conversão/carga aos
 * módulos já existentes (DRY).
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertBook } from './bible-json.ts';
import { ingestVersionFromFile } from './verse-texts.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSIONS_DIR = join(ROOT, 'data', 'versions');
const RAW_BASE = 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json';

interface ThiagoVersion {
  code: string; // nosso código (kebab-case)
  file: string; // nome do arquivo em json/ (sem extensão)
  name: string;
  language: string;
  license: string;
  sort_order: number;
}

// sort_order: grego=0, hebraico=1, getbible livres=10/20. As versões PT-BR do
// thiagobodruk ocupam 11–13, entre a Bíblia Livre (10) e a WEB inglesa (20).
const THIAGO_VERSIONS: ThiagoVersion[] = [
  {
    code: 'pt-aa',
    file: 'pt_aa',
    name: 'João Ferreira de Almeida Atualizada',
    language: 'pt',
    license: '© Sociedade Bíblica do Brasil — uso conforme licença do detentor',
    sort_order: 11,
  },
  {
    code: 'pt-nvi',
    file: 'pt_nvi',
    name: 'Nova Versão Internacional',
    language: 'pt',
    license: '© Biblica — uso conforme licença do detentor',
    sort_order: 12,
  },
  {
    code: 'pt-acf',
    file: 'pt_acf',
    name: 'Almeida Corrigida Fiel',
    language: 'pt',
    license: '© Sociedade Bíblica Trinitariana do Brasil — uso conforme licença do detentor',
    sort_order: 13,
  },
];

interface SourceBook {
  abbrev?: string;
  chapters?: string[][];
}

/** Baixa um JSON thiagobodruk e devolve o array de livros (BOM removido). */
async function fetchVersionJson(file: string): Promise<SourceBook[]> {
  const url = `${RAW_BASE}/${file}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`baixar ${file}.json: HTTP ${res.status}`);
  // UTF-8 com BOM nestes dumps; lemos como bytes e removemos o BOM antes do parse.
  const text = Buffer.from(await res.arrayBuffer()).toString('utf8').replace(/^﻿/, '');
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`formato inesperado em ${file}.json: esperado array de livros`);
  }
  return parsed as SourceBook[];
}

/** Converte um array de livros thiagobodruk no payload de data/versions/<code>.json. */
function buildPayload(books: SourceBook[], v: ThiagoVersion) {
  const verses: Array<{ ref: string; text: string }> = [];
  let converted = 0;
  for (const book of books) {
    const res = convertBook(book);
    if (!res) continue;
    converted++;
    verses.push(...res.verses);
  }
  if (verses.length === 0) {
    throw new Error(`${v.code}: nenhum versículo convertido — abreviações não reconhecidas?`);
  }
  console.log(`  ${v.code}: ${converted}/66 livros, ${verses.length} versículos`);
  return {
    code: v.code,
    name: v.name,
    language: v.language,
    license: v.license,
    source_url: 'https://github.com/thiagobodruk/bible',
    text_type: 'translation',
    sort_order: v.sort_order,
    verses,
  };
}

/**
 * Baixa, converte e carrega uma ou todas as versões thiagobodruk conhecidas.
 * `codeFilter` (opcional) restringe a um único código (ex.: 'pt-nvi').
 */
export async function ingestThiagobodruk(codeFilter?: string): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');

  const targets = codeFilter
    ? THIAGO_VERSIONS.filter((v) => v.code === codeFilter)
    : THIAGO_VERSIONS;
  if (targets.length === 0) {
    throw new Error(
      `código desconhecido: ${codeFilter}. Disponíveis: ${THIAGO_VERSIONS.map((v) => v.code).join(', ')}`,
    );
  }

  if (!existsSync(VERSIONS_DIR)) mkdirSync(VERSIONS_DIR, { recursive: true });

  for (const v of targets) {
    console.log(`\n── thiagobodruk → ${v.code} (${v.name}) ──`);
    const books = await fetchVersionJson(v.file);
    const payload = buildPayload(books, v);
    const out = join(VERSIONS_DIR, `${v.code}.json`);
    writeFileSync(out, JSON.stringify(payload, null, 0), 'utf-8');
    await ingestVersionFromFile(out);
  }
}
