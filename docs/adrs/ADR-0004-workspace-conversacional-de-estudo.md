# ADR-0004 — Workspace conversacional de estudo (fontes, citação de versículos e chat com IA)

- **Status:** Aceito
- **Data:** 2026-06-01
- **Contexto do app:** koine-study

## Contexto

O "estudo salvo" era um artefato *one-shot*: o usuário gerava um texto de um capítulo
e ele ficava congelado (`saved_studies.content`). Faltava interação: não dava para
fazer perguntas de acompanhamento, corrigir a IA, anexar material próprio nem citar
versículos avulsos de livros diferentes.

Esta mudança evolui o estudo para um **workspace conversacional**:

1. **Citar versículos da base** (com texto original + léxico) de qualquer livro.
2. **Anexar fontes** do usuário — texto inline agora; upload de arquivo no Storage;
   RAG/embeddings ficam para fase futura (schema já comporta).
3. **Conversar com a IA** em múltiplos turnos, com correções, fundamentada **somente**
   no material curado (versículos citados + fontes).
4. Na **página de comparação**, selecionar um ou mais versículos e (a) adicioná-los a um
   estudo existente, ou (b) pedir uma explicação que cria um estudo e já dispara o chat.

## Decisão

### 1. `saved_studies` vira container de workspace (campos afrouxados)

`osis`, `chapter`, `book_name` e `content` deixam de ser `NOT NULL`. Um estudo pode ser
um workspace puro de conversa (sem capítulo fixo) ou citar passagens de vários livros.
A conversa vive em `study_messages`, não em `content` (que segue exibido como legado).

### 2. Três tabelas-filha com RLS por `auth.uid()`

- `study_messages` — diálogo multi-turno (role `user`/`assistant`).
- `study_sources` — fontes do usuário; `kind='text'` (conteúdo inline) ou `kind='file'`
  (caminho no bucket privado `study-sources`). CHECK garante o payload por `kind`.
- `study_references` — versículos citados (OSIS), com `unique(study_id, ref)`.

O `user_id` é **desnormalizado** em cada filha para manter a policy simples
(`auth.uid() = user_id`). Como isso sozinho não impede anexar a um `study_id` alheio,
fechamos o furo em **duas camadas**:

- **App:** `assertOwnsStudy` confirma que o estudo-pai é do usuário antes de cada
  escrita (uma `select` na `saved_studies`, que já passa pela RLS do pai).
- **Banco (defesa em profundidade):** o `with_check` das três policies exige
  `exists(select 1 from saved_studies where id = study_id and user_id = auth.uid())`
  (migration `20260601220000`). Assim o `user_id` desnormalizado deixa de ser
  *load-bearing*: mesmo um caminho de código futuro sem o guard de app fica seguro.

### 3. Upload de arquivo: bucket privado + isolamento por prefixo de caminho

Bucket `study-sources` **privado**. Objetos vivem sob `"<user_id>/<studyId>/<arquivo>"`
e as policies de `storage.objects` liberam apenas linhas cujo 1º segmento do path seja
`auth.uid()::text` (padrão *per-user folder* do Supabase). O nome do arquivo é
sanitizado (`/[^\w.\-]+/g → _`) — sem traversal. Se o registro em `study_sources` falha
após o upload, o objeto órfão é removido do Storage (não vaza espaço).

### 4. Contexto do chat = material **curado**, montado por capítulo

`buildChatContext` agrupa as referências por `(osis, chapter)` para buscar cada capítulo
**uma única vez**, filtra os versículos desejados por um `Set` (saída em ordem canônica)
e roteia grego (`getChapter`) vs. hebraico (`getHebrewChapter`) por `book.testament`.
Anexa o texto original + léxico de cada versículo e as fontes inline (cortadas a
`MAX_SOURCE_CHARS`). Limites defensivos: `MAX_CHAT_REFERENCES = 40` (com **aviso de corte**
no contexto quando excede) e `MAX_MESSAGE_CHARS = 4000` na fronteira da rota.

### 5. Streaming com persistência resiliente a abort

A rota `/api/study/chat` persiste a mensagem do usuário **antes** de gerar (não se perde
se a IA falhar) e devolve a resposta do Gemini em streaming. O histórico injetado no
prompt é o *snapshot* anterior à inserção (`workspace.messages`), e a nova mensagem entra
**à parte** no prompt — sem duplicar nem perder.

A resposta do assistente é persistida tanto na **conclusão normal** quanto se o cliente
**abortar no meio**. Um `TransformStream.flush()` **não** roda quando o consumidor cancela
o stream; por isso usamos um `ReadableStream` com `pull` (persiste no `done`/erro) e
`cancel` (persiste o parcial e encerra o upstream), com um guard `persisted` contra
inserção dupla. Um único `TextDecoder` em modo `stream` trata UTF-8 multibyte partido
entre chunks (flush final no fim).

### 6. Soft refresh: estado do chat sobrevive às mutações dos painéis

Os painéis de fontes/referências são client components que chamam server actions e
`router.refresh()`. O refresh re-renderiza o server component (props atualizadas) **sem**
desmontar o `StudyWorkspace`, então o estado da conversa (mensagens, streaming) sobrevive.

### 7. Fluxo "Explicar com IA" via querystring `?ask=1`

O comparador cria o estudo com as referências e navega para `/studies/{id}?ask=1`. O
`StudyWorkspace` lê `autoAsk` e dispara a 1ª pergunta **uma vez**, guardado por
`autoAskedRef` **e** `messages.length === 0` — recarregar um estudo já iniciado com o
`?ask=1` ainda na URL não re-dispara.

## Consequências

- O chat só funciona autenticado (gate de auth protege a chave do Gemini e isola dados).
- Verificação ao vivo cobriu o comparador (seleção, barra de ação, picker de estudos);
  o caminho de streaming/criação é *auth-gated* e não foi exercido no preview sem login —
  o gate respondeu corretamente (`401`/"Faça login").
- A migration `20260601220000` (reforço de RLS) **precisa ser aplicada** ao banco; foi
  deixada pronta mas não aplicada automaticamente (mudança de policy de segurança).
- Mitigação de *prompt injection* é leve (instrução no system prompt tratando o material
  como dado, não comando) — suficiente para app single-tenant; revisitar se estudos
  virarem compartilháveis.
- RAG/embeddings de fontes longas ficam para uma fase futura (o schema já comporta os
  campos; o contexto hoje injeta texto inline cortado).
