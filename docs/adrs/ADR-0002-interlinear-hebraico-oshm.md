# ADR-0002 — Interlinear hebraico (AT) com morfologia OSHM

- **Status:** Aceito
- **Data:** 2026-06-01
- **Contexto do app:** koine-study

## Contexto

O comparador já tinha interlinear grego clicável no NT (1 token = 1 lema/morfologia, tabela
`tokens`). Para o AT precisávamos do mesmo: cada palavra hebraica clicável, abrindo um painel com
lema do dicionário, Strong's e análise morfológica. Mas uma palavra hebraica é **multi-morfema**:
prefixos (ו/ה/ב), raiz e sufixos pronominais, cada um com lema e código próprios — o modelo do
grego (1 palavra = 1 análise) não serve.

## Decisão

1. **Tabela própria `hebrew_words`** (não reusar `tokens`): `(book_id, chapter, verse, position)`
   + `surface` (palavra apontada completa, RTL) + `morphemes` JSONB array `{s,l,g,m}`
   (surface, lemma-cru, Strong's, código OSHM). Migration `20260601160000_add_hebrew_words.sql`.

2. **Decodificação OSHM no cliente** (`lib/hebrew-morph.ts`): o banco fica enxuto guardando só o
   código OSHM (com prefixo de língua H/A); a tradução código → análise legível acontece no
   componente. Decoder OSHM puro, **sem `import 'node:*'`** (ver ADR-0003, armadilha #2).

3. **Léxico hebraico em `lemmas`** (mesma tabela do grego), carregado de openscriptures/strongs.
   O enriquecimento (forma do dicionário + glosa) é um join interlinear ↔ léxico por Strong's,
   feito em `lib/hebrew.ts` (`fetchLemmaIndex`, em fatias de 200 para não estourar a URL do `in`).

5. **Definição BDB (Brown-Driver-Briggs)** na coluna `lemmas.bdb_def` (migration
   `20260601180000`). O Strong's (1890) dá só uma glosa curta; o BDB é o melhor léxico
   acadêmico de hebraico bíblico em domínio público (CC BY 4.0 nesta digitalização). Fonte:
   `openscriptures/HebrewLexicon` — `BrownDriverBriggs.xml` (artigos) + `LexicalIndex.xml`
   (ponte Strong's ↔ id BDB via `<xref strong="N" bdb="x.y.z"/>`, número Strong's **cru**, sem "H").
   ETL `scripts/ingest/hebrew-bdb.ts` (`ingest:hebrew-bdb`). O artigo BDB inteiro é enorme e cheio
   de referências bíblicas (ruído num painel mobile); por isso guardamos só as glosas `<def>`
   (significados), na ordem do artigo e deduplicadas, unidas por "; ". A glosa Strong's curta
   continua inline; o BDB é a definição secundária mais profunda, exibida em `HebrewWordSheet`.

6. **Pronúncia/transliteração** nas colunas `lemmas.xlit` (transliteração acadêmica, ex.: `bârâʼ`)
   e `lemmas.pron` (pronúncia figurada do Strong's, ex.: `baw-raw'`), migration `20260601190000`.
   O Strong's hebraico já traz `xlit`/`pron` prontos — diferente do grego, que gera transliteração
   programaticamente (`lib/transliterate.ts`, esquema Erasmiano). Como a transliteração do niqqud
   hebraico é complexa, reusamos os campos pré-computados do Strong's em vez de um gerador. O ETL
   `hebrew-strongs.ts` passou a persistir os dois campos (antes eram descartados). Exibidos no topo
   de cada morfema em `HebrewWordSheet` como `xlit /pron/`.

7. **Tudo em português** — o léxico hebraico nasce em inglês (Strong's 1890 + BDB). Reusamos o
   pipeline de tradução LLM do grego (`scripts/ingest/translate.ts`), mas o hebraico NÃO passa pelo
   build de corpus (`data/build/lemmas.json`, `frequency>0`); ele vive só no banco. Por isso o passo
   `translate-hebrew` (`ingest:translate-hebrew`) LÊ os lemas hebraicos direto do Supabase
   (`strongs like 'H%'`) e traduz dois campos: `gloss_en → gloss_pt` (prompt fiel, não condensa) e
   `bdb_def → bdb_def_pt` (lista de glosas unidas por "; ", preservando a estrutura). Caches
   resumíveis por campo (`data/build/hebrew-gloss.pt.json`, `hebrew-bdb.pt.json`). O painel prefere
   PT e cai para EN enquanto a tradução não cobre tudo (`gloss_pt ?? gloss_en`, `bdb_def_pt ?? bdb_def`).

4. **Componentes RTL** `HebrewVerse` / `HebrewWordSheet` (`components/hebrew/`), espelhando
   `GreekVerse`/`TokenSheet`. `dir="rtl"` + família `font-hebrew`.

5. **Pipeline ETL:** `ingest:download-hebrew` (WLC openscriptures/morphhb) → `ingest:hebrew`
   (texto AT em `verse_texts`, code `hbo-wlc`) → `ingest:hebrew-lexicon` (Strong's + xlit/pron →
   `lemmas`) → `ingest:hebrew-bdb` (BDB → `lemmas.bdb_def`) → `ingest:hebrew-interlinear`
   (`hebrew_words`) → `ingest:translate-hebrew` (gloss + BDB → PT). Arquivos:
   `scripts/ingest/hebrew-{wlc,strongs,bdb,interlinear}.ts` + `translate.ts`.

## Consequências / armadilhas resolvidas

- **`lemmas.id` é identity "by default"** e o build grego insere ids explícitos → o ETL hebraico
  precisa atribuir ids explícitos: reusa o id de um par existente, aloca `max+1` para novos. Não
  deixe o banco gerar (colide com os ids explícitos do grego).
- **Léxico vem como `.js`** cujo extrator de objeto precisa **ignorar chaves `{}` dentro de strings**.
- **`getHebrewChapter` NÃO pode retornar `Map`** (passa por `unstable_cache`) → retorna
  `{verses: {verse, words}[]}` e `chapter-view` monta o Map localmente. Ver ADR-0003.
- Status verificado ao vivo (2026-06-01): 8.674 lemas hebraicos + 306.785 palavras; `/compare/Gen/1`
  renderiza interlinear RTL clicável; NT grego sem regressão.
- **BDB carregado (2026-06-01):** 6.863 dos 8.674 lemas hebraicos com `bdb_def` (os ~1.8k restantes
  são raízes/nomes próprios sem glosa `<def>` no artigo BDB — esperado). `/compare/Gen/1` mostra a
  linha "BDB:" no painel da palavra (ex.: H430 אֱלֹהִים → "rulers; judges; divine ones; angels; gods…").
- **Cache:** `getHebrewChapter` passa por `unstable_cache` (revalidate 24h) e persiste em
  `.next/cache`; ao recarregar o léxico, limpe `.next/cache` (ou `revalidateTag('corpus')`) para a
  UI refletir o novo dado. Ver ADR-0003.
