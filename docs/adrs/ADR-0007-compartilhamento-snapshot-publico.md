# ADR-0007 — Compartilhamento de estudo/anotação por link público (snapshot congelado)

- **Status:** Aceito
- **Data:** 2026-06-03
- **Contexto do app:** koine-study

## Contexto

Estudos (`saved_studies` + `study_messages`/`study_sources`/`study_references`) e anotações
(`annotations`) são **privados por RLS** (`auth.uid() = user_id`); só o corpus bíblico/léxico é
público. O usuário pediu para **compartilhar um estudo ou anotação** com terceiros (pastor, grupo)
e **exportar em PDF**. Compartilhar exige abrir uma saída controlada do RLS sem expor o restante
dos dados do dono.

## Decisão

1. **Snapshot congelado, não espelho ao vivo.** Ao compartilhar, gravamos uma **cópia** do conteúdo
   renderizável em `shared_snapshots.payload` (jsonb). Edições futuras no estudo/anotação **não
   vazam** pelo link; re-compartilhar (“Atualizar snapshot”) regrava o payload. Justificativa:
   estabilidade do que foi enviado e menor superfície de exposição (o link não segue mudanças nem
   exclusões de fontes).

2. **Link público por token, sem login para o destinatário.** Token = `crypto.randomUUID()`
   (não-adivinhável), exposto como `/share/{token}`. Combina com um app pessoal: manda-se o link e
   ninguém precisa criar conta.

3. **Leitura pública por RPC `SECURITY DEFINER`, não por policy ampla.** `get_shared_snapshot(token)`
   roda como o dono da função (ignora RLS) e devolve **só a linha do token** (`where token = ... limit 1`),
   com `search_path` fixo e `grant execute` para `anon`. **Não** criamos policy de `SELECT` pública
   na tabela — isso permitiria enumerar/baixar snapshots alheios. A tabela em si segue restrita à RLS
   do dono (`own_shared_snapshots`), que gerencia/revoga os próprios links.

4. **Privacidade das fontes:** no snapshot do estudo, as fontes (`study_sources`) entram **só com o
   título** — o conteúdo de textos/arquivos enviados **não** viaja no payload público.

5. **Um link estável por (usuário, tipo, item)** — `unique (user_id, kind, source_id)`. Re-compartilhar
   faz upsert mantendo o token; “Revogar” apaga a linha. Exclusão do estudo/anotação **revoga o link**
   (as actions `deleteStudy`/`deleteAnnotation` apagam o snapshot antes — o snapshot é polimórfico e
   não cascateia por FK).

6. **Export PDF via `@react-pdf/renderer`** num route handler Node (`/share/{token}/pdf`), gerando um
   `.pdf` baixável (`Content-Disposition: attachment`). Declarado em
   `serverComponentsExternalPackages` para não ser empacotado pelo bundler. Fonte **DejaVu Sans**
   (registrada por CDN), que cobre **Latin + Grego + Hebraico** numa família única — necessário num
   app de grego/hebraico, onde corpos de anotação e mensagens trazem essas escritas.

## Arquitetura

- **Anti-Corruption / DTO de apresentação:** `lib/shared-studies.ts` define a forma do payload
  (`StudySnapshot`/`AnnotationSnapshot`), monta a partir das leituras privadas (RLS) e relê o público
  via RPC. A mesma forma alimenta a página HTML e o documento PDF (uma fonte de verdade).
- **Fluxo:** `ShareButton` (client) → `shareStudy/shareAnnotation` (action, monta snapshot + upsert)
  → token → `/share/{token}` (página read-only) e `/share/{token}/pdf` (PDF).

## Consequências / armadilhas

- **PDF: glifos gregos/hebraicos renderizam (DejaVu Sans via CDN).** O Hebraico aparece com os glifos
  corretos, mas **sem reordenação RTL completa** (a leitura web cobre o RTL; no PDF é limitação do
  `@react-pdf`). A fonte é baixada uma vez por processo e cacheada; se o CDN falhar, o texto não-Latin
  pode não renderizar — migrar para fonte empacotada (`public/`/`assets/`) é a evolução natural.
- **Snapshot ≠ ao vivo:** o destinatário vê o estado do momento do compartilhamento; mudanças exigem
  “Atualizar snapshot”. É intencional.
- **Token no histórico/URL:** quem tiver o link acessa; a revogação apaga o snapshot e invalida o link.
- **`SECURITY DEFINER` é o único caminho público;** acesso direto à tabela continua sob RLS do dono.
