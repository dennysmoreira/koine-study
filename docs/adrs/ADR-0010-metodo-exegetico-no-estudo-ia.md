# ADR-0010 — Método exegético no Estudo com IA

- **Status:** Aceito
- **Data:** 2026-06-09
- **Contexto do app:** Hermeneus (koine-study)

## Contexto

O "Estudo com IA" gerava análises sem um método explícito. O usuário pediu que o estudo siga os
critérios de manuais clássicos de exegese (Fee & Stuart, *Manual de Exegese Bíblica* e *Como Ler a
Bíblia Livro por Livro*; Carlos Osvaldo C. Pinto, *Fundamentos para Exegese do NT*; Uwe Wegner,
*Exegese do NT*; D. B. Wallace, *Gramática Grega*; mais um léxico grego-português).

## Decisão

1. **Codificar o MÉTODO, não o texto.** Os livros são protegidos por copyright — **não** foram
   ingeridos nem citados. O que foi codificado nos prompts é a **metodologia** (sequência de passos
   e critérios exegéticos), que é procedimento/ideia, não expressão protegida. Se o usuário quiser
   o conteúdo de uma obra, pode anexá-la como **fonte pessoal** do seu estudo (uso próprio), nunca
   embutida/redistribuída pelo app.

2. **Método histórico-gramatical** como núcleo comum dessas obras, codificado em:
   - `lib/study.ts` `buildStudySystem` e `STUDY_CHAT_SYSTEM` — postura metodológica + travas:
     gênero + contexto histórico-literário; sentido para a **audiência original** antes da aplicação;
     no estudo de palavras, **evitar falácias semânticas** (etimologismo, sobrecarga de sentido,
     anacronismo); apoiar a gramática na **morfologia fornecida** (não inventar).
   - `lib/study-modes.ts` modo **Estudo exegético** → roteiro de 9 passos: (1) delimitação/contexto,
     (2) gênero, (3) estrutura/fluxo do argumento, (4) gramática-sintaxe, (5) palavras-chave,
     (6) traduções, (7) paralelos/teologia bíblica, (8) síntese (proposição central), (9) aplicação.
   - Modo **Esboço de pregação** → expositivo (a mensagem nasce da exegese, não impõe tema ao texto).

3. **Texto puro, não Markdown.** De passagem, corrigiu-se uma inconsistência: os modos pediam saída
   "em Markdown", mas a UI renderiza texto plano (`whitespace-pre-wrap`) — então `#`/`*` apareciam
   crus. Todos os modos passam a produzir TEXTO PURO (seções tituladas em CAIXA ALTA, separadas por
   linha em branco), consistente com `buildStudySystem` e com a renderização.

## Consequências / armadilhas

- **Fidelidade depende do modelo.** O prompt orienta o método e proíbe inventar (variantes textuais,
  datas, dados lexicais), mas a aderência final é do LLM. O material fornecido (original + léxico +
  traduções + referências) é a âncora; passos sem material o modelo deve declarar incompletos.
- **Sem crítica textual real.** O app não tem aparato crítico; o método não pede ao modelo "fazer"
  crítica textual (evita alucinação de variantes) — foca no que é fundamentável.
- **Aderência ao copyright:** método sim, texto não. Documentado aqui como decisão permanente.
