import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import { getBookByOsis } from './corpus';

// ── Interlinear hebraico (AT) ───────────────────────────────────────────────
//
// Espelha o corpus grego (lib/corpus), mas o hebraico vive numa tabela própria
// (`hebrew_words`) porque uma palavra hebraica é MULTI-MORFEMA: prefixos (ו/ה/ב),
// raiz e sufixos pronominais, cada um com lema e código OSHM próprios — diferente
// do token grego (1 palavra = 1 lema/morfologia). Os morfemas chegam num array
// JSONB; aqui enriquecemos cada morfema com a FORMA do dicionário e a glosa,
// buscadas em `lemmas` por Strong's (a junção interlinear ↔ léxico é estável
// entre rebuilds). A decodificação OSHM → análise legível acontece no cliente
// (lib/hebrew-morph.ts), mantendo o banco enxuto.

export interface HebrewMorpheme {
  surface: string; // grafema do morfema
  lemmaRaw: string; // pedaço cru do atributo lemma do WLC
  strongs: string | null; // Strong's "H####" | null (prefixos não têm)
  code: string | null; // código OSHM (com prefixo de língua H/A) | null
  lemmaForm: string | null; // forma hebraica do dicionário (de `lemmas`)
  xlit: string | null; // transliteração acadêmica (ex.: "bârâʼ")
  pron: string | null; // pronúncia figurada do Strong's (ex.: "baw-raw'")
  gloss: string | null; // glosa curta (gloss_pt ?? gloss_en)
  bdbDef: string | null; // definição BDB concisa (bdb_def_pt ?? bdb_def)
}

export interface HebrewWord {
  position: number; // ordem da palavra no versículo
  surface: string; // palavra apontada completa (RTL, p/ exibição)
  morphemes: HebrewMorpheme[];
}

export interface HebrewChapterVerse {
  verse: number;
  words: HebrewWord[];
}

export interface HebrewChapter {
  // palavras agrupadas por versículo, em ordem. Um ARRAY (não Map) porque o
  // retorno passa por unstable_cache, que serializa em JSON — um Map viraria {}
  // e perderia o método .get. O consumidor (chapter-view) monta o Map localmente,
  // espelhando o corpus grego (getChapter também devolve array de versículos).
  verses: HebrewChapterVerse[];
}

// shape cru do JSONB em hebrew_words.morphemes: { s, l, g, m }
interface RawMorpheme {
  s: string;
  l: string;
  g: string | null;
  m: string | null;
}

interface RawHebrewWord {
  verse: number;
  position: number;
  surface: string;
  morphemes: RawMorpheme[];
}

const CORPUS_CACHE = { revalidate: 60 * 60 * 24, tags: ['corpus'] };

/** Mapa Strong's → { forma, glosa } a partir de `lemmas`, para os Strong's dados. */
interface LemmaInfo {
  form: string;
  xlit: string | null;
  pron: string | null;
  gloss: string | null;
  bdbDef: string | null;
}

async function fetchLemmaIndex(strongsList: string[]): Promise<Map<string, LemmaInfo>> {
  const index = new Map<string, LemmaInfo>();
  if (strongsList.length === 0) return index;

  // PostgREST limita o payload; busca em fatias para não estourar a URL com `in`.
  const SLICE = 200;
  for (let i = 0; i < strongsList.length; i += SLICE) {
    const slice = strongsList.slice(i, i + SLICE);
    const { data, error } = await supabase
      .from('lemmas')
      .select('lemma,xlit,pron,gloss_pt,gloss_en,bdb_def,bdb_def_pt,strongs')
      .in('strongs', slice);
    if (error) throw new Error(`getHebrewChapter lemmas: ${error.message}`);
    for (const r of (data ?? []) as Array<{
      lemma: string;
      xlit: string | null;
      pron: string | null;
      gloss_pt: string | null;
      gloss_en: string | null;
      bdb_def: string | null;
      bdb_def_pt: string | null;
      strongs: string | null;
    }>) {
      if (!r.strongs || index.has(r.strongs)) continue; // 1ª entrada por Strong's (homógrafos)
      index.set(r.strongs, {
        form: r.lemma,
        xlit: r.xlit,
        pron: r.pron,
        // prefere PT; cai para EN enquanto a tradução do léxico hebraico não cobre tudo
        gloss: r.gloss_pt ?? r.gloss_en,
        bdbDef: r.bdb_def_pt ?? r.bdb_def,
      });
    }
  }
  return index;
}

async function fetchHebrewChapter(osis: string, chapter: number): Promise<HebrewChapter | null> {
  const book = await getBookByOsis(osis);
  if (!book) return null;

  const { data, error } = await supabase
    .from('hebrew_words')
    .select('verse,position,surface,morphemes')
    .eq('book_id', book.id)
    .eq('chapter', chapter)
    .order('verse')
    .order('position');
  if (error) throw new Error(`getHebrewChapter: ${error.message}`);

  const rows = (data ?? []) as RawHebrewWord[];
  if (rows.length === 0) return { verses: [] };

  // Strong's distintos do capítulo → uma única busca no léxico (enriquecimento).
  const strongsSet = new Set<string>();
  for (const w of rows) for (const m of w.morphemes) if (m.g) strongsSet.add(m.g);
  const lemmaIndex = await fetchLemmaIndex([...strongsSet]);

  // Agrupa preservando a ordem (rows já vêm ordenadas por verse, position).
  const byVerse = new Map<number, HebrewWord[]>();
  for (const w of rows) {
    const morphemes: HebrewMorpheme[] = w.morphemes.map((m) => {
      const lex = m.g ? lemmaIndex.get(m.g) ?? null : null;
      return {
        surface: m.s,
        lemmaRaw: m.l,
        strongs: m.g,
        code: m.m,
        lemmaForm: lex?.form ?? null,
        xlit: lex?.xlit ?? null,
        pron: lex?.pron ?? null,
        gloss: lex?.gloss ?? null,
        bdbDef: lex?.bdbDef ?? null,
      };
    });
    const word: HebrewWord = { position: w.position, surface: w.surface, morphemes };
    const list = byVerse.get(w.verse);
    if (list) list.push(word);
    else byVerse.set(w.verse, [word]);
  }

  const verses: HebrewChapterVerse[] = Array.from(byVerse, ([verse, words]) => ({ verse, words }));
  return { verses };
}

export const getHebrewChapter = unstable_cache(
  fetchHebrewChapter,
  ['corpus:hebrew-chapter'],
  CORPUS_CACHE,
);
