/**
 * Conversor de USFM → JSON do cadastro de versões (data/versions/*.json).
 *
 * USFM (Unified Standard Format Markers) é o formato de fato para troca de
 * texto bíblico (Paratext). Editoras/sociedades bíblicas que licenciam o texto
 * normalmente entregam um arquivo .usfm/.sfm por livro. Este passo NÃO baixa
 * nada — ele apenas CONVERTE um arquivo que VOCÊ já possui (sob licença) para o
 * formato que o passo `ingest-version-file` carrega no banco.
 *
 * Fluxo:
 *   1) editora entrega .usfm/.sfm (sob licença)
 *   2) npm run ingest:convert-usfm -- --input=<dir|arquivo> --code=pt-nvi \
 *        --name="Nova Versão Internacional" --language=pt \
 *        --sort-order=15
 *   3) gera data/versions/pt-nvi.json
 *   4) npm run ingest:version-file -- --file=data/versions/pt-nvi.json
 *
 * É um Adapter: isola as idiossincrasias do USFM do nosso modelo interno.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

// Códigos de livro do USFM/Paratext (NT) → nosso osis_code.
// Atenção: diferem dos códigos byztxt (MRK≠MAR, JHN≠JOH, JAS≠JAM, 1JN≠1JO...).
const USFM_TO_OSIS: Record<string, string> = {
  MAT: 'Matt',
  MRK: 'Mark',
  LUK: 'Luke',
  JHN: 'John',
  ACT: 'Acts',
  ROM: 'Rom',
  '1CO': '1Cor',
  '2CO': '2Cor',
  GAL: 'Gal',
  EPH: 'Eph',
  PHP: 'Phil',
  COL: 'Col',
  '1TH': '1Thess',
  '2TH': '2Thess',
  '1TI': '1Tim',
  '2TI': '2Tim',
  TIT: 'Titus',
  PHM: 'Phlm',
  HEB: 'Heb',
  JAS: 'Jas',
  '1PE': '1Pet',
  '2PE': '2Pet',
  '1JN': '1John',
  '2JN': '2John',
  '3JN': '3John',
  JUD: 'Jude',
  REV: 'Rev',
  // aliases tolerantes (alguns exports usam códigos no estilo byztxt)
  MAR: 'Mark',
  JOH: 'John',
  JAM: 'Jas',
  '1JO': '1John',
  '2JO': '2John',
  '3JO': '3John',
};

interface OutVerse {
  ref: string;
  text: string;
}

/** Remove notas de rodapé e referências cruzadas (conteúdo inteiro). */
function stripNotes(s: string): string {
  return s.replace(/\\(f|fe|ef|x|ex)\b[\s\S]*?\\\1\*/g, '');
}

/**
 * Resolve marcadores \w ...\w* (e \+w) preservando só a palavra, descartando
 * atributos após "|" (ex.: "\w graça|strong="G5485"\w*" → "graça").
 */
function resolveWordMarkers(s: string): string {
  return s.replace(/\\\+?w\s+([\s\S]*?)\\\+?w\*/g, (_m, inner: string) => {
    const bar = inner.indexOf('|');
    return bar >= 0 ? inner.slice(0, bar) : inner;
  });
}

/** Remove qualquer marcador USFM restante (aberturas e fechamentos) e normaliza. */
function stripMarkersAndNormalize(s: string): string {
  return s
    .replace(/\\\+?[\w-]+\*/g, ' ') // fechamentos: \nd* \add* ...
    .replace(/\\\+?[\w-]+\s?/g, ' ') // aberturas: \p \q1 \nd \add \v(removido antes) ...
    .replace(/[~]/g, ' ') // ~ = espaço inquebrável
    .replace(/\/\//g, ' ') // // = quebra de linha opcional
    .replace(/\|[^\\]*/g, ' ') // atributos órfãos de milestones
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai o código do livro do marcador \id (primeiro token). */
function parseBookId(content: string): string | null {
  const m = content.match(/\\id\s+([A-Z0-9]{3})/i);
  return m && m[1] ? m[1].toUpperCase() : null;
}

/** Converte o conteúdo de UM arquivo USFM em versículos {ref, text}. */
function convertOneFile(content: string): { osis: string; verses: OutVerse[] } | null {
  const code = parseBookId(content);
  if (!code) return null;
  const osis = USFM_TO_OSIS[code];
  if (!osis) {
    console.warn(`  aviso: código de livro desconhecido "${code}" — arquivo ignorado.`);
    return null;
  }

  let body = stripNotes(content);
  body = resolveWordMarkers(body);

  const verses: OutVerse[] = [];
  // separa por capítulo: \c N
  const chapterParts = body.split(/\\c\s+/).slice(1); // descarta cabeçalho antes do 1º \c
  for (const part of chapterParts) {
    const chMatch = part.match(/^(\d+)/);
    if (!chMatch || !chMatch[1]) continue;
    const chapter = Number(chMatch[1]);

    // versículos: \v N texto  (N pode ser "6", "6a", "6-7")
    const re = /\\v\s+(\d+)(?:[a-z]|-\d+)?\s+([\s\S]*?)(?=\\v\s+\d|$)/g;
    let mv: RegExpExecArray | null;
    while ((mv = re.exec(part)) !== null) {
      const verse = Number(mv[1]);
      const text = stripMarkersAndNormalize(mv[2] ?? '');
      if (!text) continue;
      verses.push({ ref: `${osis} ${chapter}:${verse}`, text });
    }
  }
  return { osis, verses };
}

/** Lista arquivos USFM de um caminho (arquivo único ou diretório). */
function collectUsfmFiles(input: string): string[] {
  const st = statSync(input);
  if (st.isFile()) return [input];
  const exts = new Set(['.usfm', '.sfm', '.usx']);
  return readdirSync(input)
    .filter((f) => exts.has(extname(f).toLowerCase()))
    .map((f) => join(input, f))
    .sort();
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

/**
 * Converte USFM(s) no formato data/versions/*.json. Os metadados da versão
 * (code/name/language...) vêm de flags, pois não estão no arquivo de texto.
 */
export function convertUsfm(): void {
  const input = arg('input');
  if (!input) {
    throw new Error(
      'informe a entrada: npm run ingest:convert-usfm -- --input=<dir|arquivo.usfm> --code=pt-nvi --name="..." --language=pt',
    );
  }
  if (!existsSync(input)) throw new Error(`entrada não encontrada: ${input}`);

  const code = arg('code');
  const name = arg('name');
  const language = arg('language');
  const missing = [
    ['code', code],
    ['name', name],
    ['language', language],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`flags obrigatórias ausentes: ${missing.map((m) => `--${m}`).join(' ')}`);

  const files = collectUsfmFiles(input);
  if (files.length === 0) throw new Error(`nenhum arquivo .usfm/.sfm/.usx em ${input}`);
  console.log(`convertendo ${files.length} arquivo(s) USFM...`);

  const allVerses: OutVerse[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const res = convertOneFile(content);
    if (!res) continue;
    allVerses.push(...res.verses);
    console.log(`  ${res.osis.padEnd(8)} ${res.verses.length} versículos`);
  }
  if (allVerses.length === 0) throw new Error('nenhum versículo extraído — verifique se os arquivos são USFM válidos.');

  const out =
    arg('out') ?? join('data', 'versions', `${code}.json`);
  const outDir = join(out, '..');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const payload = {
    code,
    name,
    language,
    source_url: arg('source-url') ?? null,
    text_type: arg('text-type') ?? 'translation',
    sort_order: Number(arg('sort-order') ?? 50),
    verses: allVerses,
  };
  writeFileSync(out, JSON.stringify(payload, null, 0), 'utf-8');
  console.log(`\n${allVerses.length} versículos → ${out}`);
  console.log(`próximo passo: npm run ingest:version-file -- --file=${out}`);
}
