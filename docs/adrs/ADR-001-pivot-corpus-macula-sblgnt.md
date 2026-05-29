# ADR-001 — Pivot do corpus para MACULA Greek (SBLGNT) + stack de léxicos em camadas

- **Status:** Concluído (Fases A–I concluídas; H — tradução PT da LSJ — com infra pronta e validada, run completo opcional sob orçamento de LLM)
- **Data:** 2026-05-29
- **Decisores:** Dennys
- **Escopo:** koine-study (corpus, ETL, schema, leitor, dados de usuário)

## Contexto

O corpus atual (Fase 0) foi construído a partir do **Byzantine Majority Text** (byztxt), com
morfologia decodificada por `morph-decoder.ts` e léxico do **Dodson** + **Abbott-Smith** (este
já traduzido para PT-BR), tudo chaveado por **número de Strong's**:

```
token.strongs → lemma.strongs → léxico
```

Objetivo declarado: maximizar a **fidelidade** do texto e dos léxicos, mesmo que isso exija
refazer o ETL — e manter o software **não-comercial** (sem distribuir obra protegida).

### Restrição decisiva: copyright ≠ preço

Os recursos de referência máxima (texto **NA28/UBS5**; léxico **BDAG**) e o **THGNT**
("all rights reserved", uso por permissão da Crossway) **não são licenciáveis** para embutir
no banco — e *não-comercial não destrava obra protegida*, pois o direito autoral restringe
cópia/redistribuição, não cobrança. A decisão se restringe, portanto, ao **melhor dentro do
licenciável**.

### Filosofia textual

"Mais fiel" depende de escola de crítica textual. Adotamos o **consenso acadêmico crítico/eclético**
(reconstruir o mais próximo dos autógrafos). Quem segue a escola **majoritária** consideraria o
Byzantine atual já o mais fiel — registro a premissa para honestidade intelectual.

## Decisão

**Pivot total** do corpus: substituir o Byzantine pelo **SBLGNT** (texto crítico), ingerido via
**MACULA Greek** (Clear Bible), e adotar uma **stack de léxicos em camadas** chaveada por
**Strong's e/ou lema**.

### Fonte primária: MACULA Greek — `Clear-Bible/macula-greek`

- **Licença:** CC BY 4.0 (só atribuição; sem NC, sem share-alike).
- **Formato:** XML `lowfat/` por livro (query-friendly), 1 arquivo por livro do NT.
- **Cada token (`<w>`) já traz** (verificado em `SBLGNT/lowfat/04-john.xml`, JHN 1:1):

  | Atributo | Exemplo | Uso |
  |---|---|---|
  | `lemma` | `ἐν` | lema acentuado → ponte p/ LSJ + Moulton-Milligan |
  | `strong` | `1722` | **Strong's** → mantém Abbott-Smith + Thayer's 1:1 |
  | `normalized` | `Ἐν` | forma normalizada (busca) |
  | `unicode` / texto | `Ἐν` | superfície flexionada |
  | `morph` | `PREP` / `N-DSF` | código morfológico |
  | `case`/`number`/`gender`/`tense`/`voice`/`mood`/`person` | — | **morfologia já decodificada** (dispensa `morph-decoder` p/ este texto) |
  | `ref` | `JHN 1:1!1` | versículo + posição |
  | `xml:id` | `n43001001001` | id estável de token |
  | `domain` / `ln` | `067002` / `67.33` | domínio semântico Louw-Nida (bônus) |
  | `english` / `gloss` | `in` / `In [the]` | glosas |

  Bônus adicional: árvores sintáticas (`<wg>` com `role` de sujeito/verbo/etc.) — base p/ features
  futuras de sintaxe.

### Stack de léxicos (toda licenciável p/ app gratuito)

| Camada | Recurso | Licença | Chave | Estado |
|---|---|---|---|---|
| Glance | Dodson | PD | Strong's | temos |
| NT exegese | Abbott-Smith | PD | Strong's | temos, **em PT** |
| NT profundo | Thayer's | PD | Strong's | adiado (opcional) |
| Koiné real | Moulton-Milligan | PD (1914-29) | lema | adiado (opcional) |
| Amplitude | LSJ (via STEPBible TFLSJ) | **CC BY 4.0** | **Strong's** | **✅ carregado** (Fase C) |

> **Revisão da Fase C (decisão tomada, 2026-05-29):** a camada de amplitude usa o **STEPBible
> TFLSJ** (LSJ completo editado por Tyndale House) em vez da LSJ crua do Perseus. Vantagens
> decisivas: (1) **já vem chaveado por Strong's** — elimina o ~14% de miss da ponte por lema que
> o ADR temia; (2) licença **CC BY 4.0** (mais permissiva que a CC BY-SA 3.0 da Perseus, sem
> share-alike). Thayer's e Moulton-Milligan ficam **adiados como opcionais** — a amplitude (LSJ)
> + exegese de NT (Abbott-Smith, já em PT) cobrem o aprendiz; podem ser somados depois sem
> mudança de schema (a tabela `lexicon_entries` é OCP por `source`).

### Chaveamento duplo

Como o MACULA carrega **Strong's e lema** no mesmo token, mantemos o link 1:1 perfeito para os
léxicos por Strong's (Abbott-Smith **e LSJ**, já que o TFLSJ é chaveado por Strong's) e
preservamos o lema para léxicos clássicos por lema (Moulton-Milligan) caso sejam adicionados.

### Atribuições a exibir (rodapé do painel léxico/leitor)

SBLGNT, MACULA Greek (CC BY 4.0) e Abbott-Smith/Dodson (PD) no rodapé do leitor; LSJ via
**STEPBible** (CC BY 4.0) no próprio bloco LSJ do painel de token.

## Migração de dados de usuário (ponto sensível)

Rebuild reatribui ids sintéticos (`lemmas.id`, `tokens.id`, ambos *identity*). As referências de
usuário precisam de tratamento:

| Tabela | Referência | Risco | Estratégia |
|---|---|---|---|
| `srs_cards` | `lemma_id` → `lemmas.id` | **Alto** — quebra progresso de revisão | Remapear via **bridge por Strong's**: `old_lemma_id → strongs → new_lemma_id`. `strongs` é chave externa estável; sobrevive à troca de corpus. |
| `quiz_attempts` | `token_id` → `tokens.id` | Médio — tokens são posicionais, não estáveis entre edições | É **log histórico** (acerto/erro + timestamp). Tornar `token_id` nullable + `ON DELETE SET NULL`; preservar as linhas como estatística agregada. |
| `study_progress` | `lesson_id` (text) | **Nenhum** — lições são estáticas (`lib/lessons.ts`), não dependem do corpus | Sem migração. |

**Edge cases do bridge SRS:**
- Lema com Strong's que existia no Byzantine mas **não** no SBLGNT (divergência textual): card fica
  órfão. Decisão: **manter o card** (palavra ainda é vocabulário válido) com `lemma_id` apontando
  ao lema preservado por texto/Strong's; se nem por Strong's casar, **logar e manter** sem quebrar.
- Strong's que mapeia >1 lema: usar `(strongs, lemma)` como chave composta no remap (mesma unique da tabela).

## Plano de execução (fases)

1. **Fase A — Fontes & licença (✅ verificado neste ADR).** Confirmar repos/licenças: MACULA (CC BY 4.0),
   SBLGNT EULA (distribuição livre não-comercial + atribuição), Moulton-Milligan (PD), Thayer's (PD), LSJ (CC BY-SA).
2. **Fase B — Parser MACULA lowfat.** Novo `scripts/ingest/macula.ts`: baixar `SBLGNT/lowfat/*.xml`,
   parsear `<w>` → tokens com `lemma`, `strong`, `normalized`, morfologia (atributos diretos),
   `ref`/`xml:id`. Derivar `verses`, `lemmas` (dedup por `(strongs, lemma)`), `frequency`.
3. **Fase C — Léxicos (✅ LSJ carregado).** **Decisão tomada:** tabela
   `lexicon_entries(lemma_id, source, text_en, text_pt, sort_order)` (não coluna-por-fonte) —
   extensível (OCP) e guarda EN+PT lado a lado. As glosas curtas (headword) seguem em
   `lemmas.gloss_en/gloss_pt`. **Fonte da amplitude revista:** STEPBible **TFLSJ** (LSJ Tyndale,
   CC BY 4.0, **chaveado por Strong's** — supera a ponte por lema). Pipeline: `stepbible-lsj.ts`
   (`cleanLsj` remove citações clássicas/markup, preserva sentidos `__1/__II`; `parseTflsj`
   chaveia por Strong's canônico, first-wins main>extra) → steps `download-stepbible` /
   `build-lexicons` (`data/build/lexicon-entries.json`, 10.769 entradas) / `load-lexicons`
   (resolve Strong's→lemma_id com fan-out p/ homógrafos, upsert idempotente em `onConflict
   lemma_id,source`). **Carregadas 5.631 linhas** (≈99,9% dos lemas do NT; 5.333 entradas extra-NT
   descartadas). Reader: Server Action `app/read/actions.ts#fetchLexicon` + `getLexiconEntries`
   (cacheado, dedup por source) → `TokenSheet` busca sob demanda (entradas grandes não viajam no
   payload do capítulo) e renderiza a seção LSJ com atribuição STEPBible/CC BY 4.0.
   Thayer's/Moulton-Milligan adiados (opcionais; sem mudança de schema p/ somá-los depois).
4. **Fase D — Schema/migrations (✅ migration escrita).** `20260529140000_pivot_sblgnt_lexicon_entries.sql`:
   cria `lexicon_entries` (RLS leitura pública) e torna `quiz_attempts.token_id` nullable + `ON DELETE SET NULL`.
   Aditiva e não-destrutiva (pode ser aplicada antes do reload). Morfologia do SBLGNT já vem decodificada,
   sem mudança de colunas em `tokens` (o build MACULA preenche `m_*` via `decodeMorph`).
5. **Fase E — Migração de dados de usuário (✅).** `reload.ts` snapshota cada `srs_card` com
   `(strongs, lemma)` do lema antigo ANTES de apagar; após recarregar, remapeia `(strongs,lemma)→strongs→new_lemma_id`
   e reinsere preservando estado FSRS. Snapshot persistido em disco (`srs-snapshot.json`) antes de qualquer
   delete (rede de segurança). Órfãos logados e descartados. Colisão de remap resolve para o card de menor `due_at`.
6. **Fase F — Re-load do corpus (✅).** `reload.ts` (gated por `--confirm`, dry-run por padrão): delete na ordem
   de FK (srs_cards→tokens→verses→lemmas→books) e re-insert batched do build novo. Helpers `insertBatched`/`deleteAll`
   extraídos para `supabase-io.ts` (DRY). **Sub-tarefa de recuperação:** o reload reescreveu `lemmas.abbott_smith`/`gloss_pt`
   com o build (EN/nulo), perdendo as traduções PT no banco. Os caches `data/build/{abbott,lemmas}.pt.json` sobreviveram
   chaveados pelo `old_id` volátil; `rekey-abbott-pt.ts` reconstruiu `old_id→strongs` (determinístico, espelha `parseLemmas`),
   re-chaveou os caches por Strong's (chave estável) e os reaplicou via `--apply` (5326 Abbott-Smith + 5526 linhas gloss_pt).
   Âncoras de sanidade (θεός→Deus, Χριστός→Cristo, κύριος→Senhor) guardam contra drift do dodson.csv.
7. **Fase G — App (✅).** `lib/corpus.ts` já SBLGNT-compatível (TOKEN_COLUMNS com `normalized`+`abbott_smith`,
   sem mudança). Rodapé de atribuições adicionado ao leitor (`components/Reader.tsx`: SBLGNT · MACULA Greek CC BY 4.0 ·
   léxicos domínio público) — CC BY exige crédito. **Desvio do plano:** `decodeMorph` foi MANTIDO no caminho SBLGNT
   (não removido). Justificativa: o atributo `morph` do MACULA É o formato Robinson/Tauber que `decodeMorph` parseia;
   manter um único vocabulário morfológico consistente alimenta `morph-labels.ts` + o quiz de parsing sem diferença
   para o usuário e com menos risco. Data Cache do Next limpo (`.next/cache`).
8. **Fase H — Tradução PT da LSJ (infra pronta + validada).** Novo passo `translate-lsj`
   (`translateLexiconEntries` em `translate.ts`) reusa a abstração de provider + checkpoint resumível e
   aplica em `lexicon_entries.text_pt` (source='lsj'). Diferenças vs. Abbott-Smith: lote por **orçamento de
   caracteres** (`TRANSLATE_LSJ_CHARS`, default 4k) — entradas variam 200B–16KB, lote por contagem fixa
   estouraria o output do modelo; prompt LSJ que preserva grego, marcadores de sentido (`__1/__II/__b`) e
   quebras de linha; priorização por frequência no NT (runs `--limit` traduzem primeiro o vocabulário mais
   comum); apply por Strong's→lemma_id(s) (fan-out de homógrafos). Helper `lemmaIdsByStrongs` extraído para
   `supabase-io.ts` (DRY com `loadLexicons`). Smoke-test (`--limit=3`): G3588/G2532/G846 traduzidos e
   aplicados (καί atualizou as 2 linhas de homógrafo). O run completo (~5,6k entradas NT) fica a critério do
   orçamento de LLM; idempotente/resumível (cache `data/build/lsj.pt.json`), o leitor já renderiza
   `text_pt ?? text_en`. Thayer's/Moulton-Milligan idem (nem ingeridos ainda).
9. **Fase I — Verificação.** Build/typecheck, preview MCP (mobile), conferir θεός com texto crítico + 4 léxicos,
   conferir que o SRS preservou progresso (contagem de cards antes/depois).

   **Resultado (✅):** Build/typecheck/lint limpos. DB ao vivo: `lexicon_entries`=5.631 linhas; join θεός
   (G2316)→entrada LSJ (2.243 chars, `gloss_pt`="Deus, um deus"); `srs_cards`=20 (progresso preservado);
   `lemmas`=5.636 (cobertura LSJ ≈99,9%). Preview MCP (mobile 375px): leitor em João 1 renderiza o SBLGNT;
   o painel de θεόν exibe Abbott-Smith (refs em PT) + LSJ (lazy-fetch via Server Action, sentidos `__b`
   preservados) com atribuição STEPBible/CC BY 4.0. Script read-only `scripts/ingest/verify-lexicon.ts`.

## Alternativas consideradas

- **Manter Byzantine + só adicionar LSJ por ponte (86%):** menos trabalho, mas não entrega o ganho de
  fidelidade textual (escola crítica) e mantém o `morph-decoder` artesanal. Rejeitado dado o mandato.
- **Coexistir dois textos (Byzantine + SBLGNT):** dobra ETL/schema/UI. Rejeitado (pivot total escolhido).
- **THGNT como texto:** rejeitado por licença (all rights reserved).
- **Modelo de léxico — coluna por fonte vs tabela `lexicon_entries`:** tabela normaliza melhor (N fontes
  sem ALTER), coluna é mais simples de ler. **Decidido: tabela** (Fase C), pela extensibilidade (OCP) e por
  guardar EN+PT lado a lado (o `abbott_smith` atual sobrescreve o EN com o PT — perda evitada no novo modelo).

## Consequências

**Positivas:** texto crítico (consenso de fidelidade); morfologia/Louw-Nida/sintaxe prontos; chave dupla
(Strong's + lema) destrava 4 léxicos pela mesma fonte; licenças todas compatíveis com app gratuito.

**Negativas / custos:** re-ETL completo; migração de dados de usuário (mitigada pelo bridge de Strong's);
atribuições a exibir (SBLGNT, MACULA, STEPBible). Tradução PT da LSJ tem infra pronta (passo `translate-lsj`)
mas o run completo (~5,6k entradas) custa LLM/tempo — opcional/incremental; o leitor já cai em `text_en`
enquanto `text_pt` não existe. `quiz_attempts` perde o vínculo posicional
com tokens (aceito — é log).

**Riscos:** divergência textual Byzantine↔SBLGNT pode orfanar poucos cards SRS (logado, não-bloqueante).
A ponte de lema da LSJ deixou de ser risco: o TFLSJ é chaveado por Strong's (cobertura ≈99,9% dos lemas
do NT).
