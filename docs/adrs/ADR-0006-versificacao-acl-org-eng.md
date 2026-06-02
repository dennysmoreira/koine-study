# ADR-0006 — Versificação: camada anticorrupção org (TM) ↔ eng (protestante)

- **Status:** Aceito
- **Data:** 2026-06-01
- **Contexto do app:** koine-study

## Contexto

O comparador alinha as versões pelo número de versículo. Mas os dados de cada fonte vivem em
**sistemas de numeração (versificação) diferentes**:

- o hebraico (WLC) está na numeração do **Texto Massorético** (TM / `org`);
- as traduções protestantes (NVI, ACF, AA, Bíblia Livre, WEB) seguem a numeração
  **inglesa/protestante** (`eng`).

As duas divergem em **~138 capítulos do AT** — não só nos títulos dos Salmos. Há três mecanismos:

1. **Título de Salmo numerado:** o TM conta a superscrição como versículo(s); o protestante não.
   Gera um deslocamento de +1 (ex.: Sl 18) ou +2 (ex.: Sl 51, título de 2 versos).
2. **Fronteira de capítulo movida:** blocos inteiros mudam de capítulo. Ex.: eng `1Kgs 4:21-34`
   = org `1Kgs 5:1-14`; eng `Joel 3` inteiro = org `Joel 4`.
3. **Deslocamento de ±1 no fim/início do capítulo:** ex.: eng `Deut 12:32` = org `Deut 13:1`.

A primeira versão tratava só o caso (1) com um **offset escalar** (`originalVerseOffset`). Isso
cobria os Salmos, mas não os casos (2)/(3): o interlinear hebraico e o texto plano apareciam
desalinhados das traduções em ~76 capítulos não-Salmos (1-2 Reis, Crônicas, Joel, Malaquias,
Daniel, Oseias, Ezequiel, Jonas, etc.).

## Decisão

1. **Eixo de DISPLAY = `eng` (protestante).** É o número que o usuário navega (goto), cita e ancora
   anotações; é o que as traduções já usam. O hebraico (`org`) é **remapeado** para esse eixo. A
   versificação é uma propriedade de **apresentação**, não do texto armazenado.

2. **Camada anticorrupção (ACL, DDD)** em `lib/versification.ts`: em vez de reescrever os dados
   (que vivem na numeração canônica de cada fonte), traduzimos as coordenadas numa única fronteira.
   API exposta:
   - `originalToDisplay(osis, chapter, verse): DisplayRef` — dado um versículo **org/TM**, em qual
     linha de **display/eng** ele entra. `verse === 0` = linha de título do Salmo. Identidade fora
     do AT (NT grego) e na maioria do AT.
   - `displayChapterHasTitle(osis, chapter)` — o capítulo de display tem linha de título?
   - `originalChapterWindow(chapter)` — `[ch-1, ch, ch+1]` (≥1): os capítulos org que podem conter
     versos exibidos neste capítulo de display (fronteiras movem blocos em no máximo ±1 capítulo).
   - `groupByDisplay(osis, chapter, items, getCoord)` — reagrupa itens na numeração org no capítulo
     de display, preservando a ordem de inserção (para merges/títulos concatenarem em ordem).

3. **Dados validados, não inventados à mão** (`lib/versification-data.ts`, arquivo **gerado**):
   `OT_ENG_TO_ORG` é uma lista de pares `eng↔org` com ranges, derivada do **mappedVerses** do
   `eng.json` da **Copenhagen Alliance versification-specification**. Código Apache 2.0;
   **dados CC BY-SA 4.0 — atribuição obrigatória** (creditada no cabeçalho do arquivo). Convertido
   de códigos USFM para OSIS. No carregamento do módulo expandimos os ranges para um índice
   verso-a-verso (`ORG_TO_DISPLAY`) e uma âncora de título por capítulo (`TITLE_ANCHOR`), que cobre
   inclusive os versos de título órfãos do offset +2.

4. **Consumidores leem o original numa janela de capítulos e remapeiam:**
   - `lib/translations.ts` (`fetchParallelChapter`): busca `verse_texts` na janela `[ch-1,ch,ch+1]`;
     a coluna original passa por `originalToDisplay` (descarta versos que caem em outro capítulo de
     display; título → 0); as traduções já estão no eixo de display. `ref` canônico vem sempre de
     uma tradução (o `ref` do original está na numeração org e não serve).
   - `lib/chapter-view.ts` (`getChapterView`): o interlinear hebraico (`hebrew_words`, numeração TM)
     é buscado na mesma janela e reagrupado por verso de display via `groupByDisplay`. O grego (NT)
     permanece identidade.
   - `app/compare/actions.ts` (`getChapterVerses`): a cascata de navegação devolve os versos no eixo
     de display, traduzindo o original da janela e descartando títulos (display verse 0).

5. **`originalVerseOffset` (escalar) foi removido.** O offset de Salmo passou a ser um caso especial
   do mapa geral (título → display verse 0).

## Consequências / armadilhas

- **Traduções não-uniformes (caveat pré-existente):** a validação contra o corpus deu hebraico =
  `org` em 930/930 capítulos do AT, mas traduções = `eng` em **927/930** — em 3 capítulos
  algumas traduções (pt-aa/pt-acf) seguem a numeração hebraica em vez da protestante. Como o eixo
  de display é `eng`, esses 3 capítulos podem ter um leve descompasso **nas traduções** (não no
  hebraico). É um problema dos **dados de origem** daquelas traduções, não do mapeamento — fica
  documentado aqui e não é regressão.
- **Janela ±1 é suficiente:** todas as fronteiras conhecidas movem blocos em no máximo um capítulo.
  Se algum dia surgir um deslocamento maior, ampliar `originalChapterWindow`.
- **Ordem de concatenação:** merges (título de 2 versos; versos org fundidos numa linha de display)
  concatenam textos/palavras na ordem de leitura — por isso as queries ordenam por `(chapter, verse)`
  e `groupByDisplay` preserva a ordem de inserção.
- **`ref` do original nunca é canônico:** vive na numeração org (adiantada ou em outro capítulo);
  o ref de display é montado de uma tradução ou de `${osis} ${chapter}:${displayVerse}`.
- **Verificado ao vivo (2026-06-01):**
  - `Ps 18` (+1): título reúne a superscrição inteira; display v1 (אֶרְחָמְךָ) = NVI 18:1 "Eu te amo, ó Senhor".
  - `Ps 51` (+2, título de 2 versos): título compacta org v1-2; display v1 (חָנֵּנִי) = NVI 51:1.
  - `John 3` (NT): identidade, sem linha de título, sem regressão.
  - `Joel 3` (capítulo inteiro deslocado: org 4 → display 3): 21 linhas; display 3:1 (כִּי, de org 4:1)
    = NVI "Sim, naqueles dias e naquele tempo…".
  - `1Kgs 5` (bloco parcial +14: org 5:15-32 → display 5:1-18): 18 linhas; display 5:1 (de org 5:15)
    = NVI "Quando Hirão, rei de Tiro…"; display 5:18 = org 5:32.
  - `tsc --noEmit` e `next lint` limpos nos quatro arquivos alterados.
