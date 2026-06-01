# ADR-0005 — BYOK do Gemini + Groq como rede de segurança (failover de IA multi-provedor)

- **Status:** Aceito
- **Data:** 2026-06-01
- **Contexto do app:** koine-study

## Contexto

O estudo com IA (geração de explicação + chat conversacional do ADR-0004) dependia de
uma cadeia de chaves Gemini **compartilhadas** do host (`GEMINI_API_KEY[_2..N]`). Dois
problemas surgiram ao querer disponibilizar o app para outras pessoas sem plano pago:

1. **Teto de cota compartilhada.** O free tier do Gemini limita por projeto
   (RPM/RPD/TPM). Com vários usuários na mesma chave, o limite diário (RPD) é atingido
   e **todos** passam a tomar `HTTP 429` — um usuário esgota a cota dos demais.
2. **Ponto único de falha de provedor.** Em **2026-06-01** o Google desligou
   `gemini-2.0-flash` e `gemini-2.0-flash-lite`, encolhendo silenciosamente a cadeia de
   modelos. Uma indisponibilidade ampla do Gemini derrubaria o estudo por inteiro, pois
   não havia provedor alternativo.

A meta é manter o custo do host em **~US$ 0** e, ainda assim, ofertar o recurso a
terceiros com degradação graciosa.

## Decisão

### 1. BYOK — cada usuário traz sua própria chave do Gemini

Um usuário pode cadastrar **sua** chave gratuita do Gemini em `/settings`. As chamadas de
IA passam a gastar a **cota dele**, não a do host. Isso remove o teto compartilhado para
quem cadastra e mantém o custo do host em zero.

- Tabela `public.user_settings` (`user_id` PK → `auth.users`, `gemini_api_key_enc text`),
  RLS *own-rows* (`auth.uid() = user_id`), migration `20260601230000`.
- O cliente **nunca** lê a chave de volta: a UI só sabe se **existe** uma (`hasUserGeminiKey`
  retorna boolean). `getUserGeminiKey` (server-only) é o único caminho que descriptografa.

### 2. Cifra em camada de aplicação (AES-256-GCM), não texto puro

Guardar a chave de um terceiro em texto puro é irresponsável num app multiusuário. A
chave é cifrada com **AES-256-GCM** (cifra autenticada: confidencialidade + `authTag`
detecta adulteração) em `lib/crypto.ts`.

- A **chave-mestra** vem de `APP_SECRET_KEY` (32 bytes em base64), só no ambiente do
  servidor — **nunca** no banco. Vazamento do banco expõe apenas ciphertext inútil.
- Envelope persistido: `v1.<iv>.<tag>.<data>` (base64). O prefixo de versão permite
  trocar de esquema/chave no futuro sem ambiguidade.
- **Degradação graciosa:** `encryptSecret` lança com mensagem acionável se `APP_SECRET_KEY`
  faltar (a server action trata e o cadastro de BYOK fica indisponível); `decryptSecret`
  retorna `null` em qualquer falha (chave ausente/errada, formato inválido, tag adulterada)
  — o app cai para as chaves compartilhadas / Groq sem quebrar.

### 3. Cadeia de failover multi-provedor (a 1ª que conectar vence)

`streamChatText` (antes `streamGeminiText`) monta uma lista ordenada de tentativas
`(provedor × chave × modelo)` em `buildAttempts(userGeminiKey)` e devolve o **stream do
primeiro `HTTP 200`**. Ordem de preferência:

1. **Chave Gemini do usuário** (BYOK) × modelos Gemini — gasta a cota dele.
2. **Chaves Gemini compartilhadas** (`GEMINI_API_KEY[_2..N]`) × modelos Gemini — rede 1.
3. **Groq** (`GROQ_API_KEY`) × modelos Groq — rede 2.

Groq é um **provedor distinto** (não Google), com free tier generoso: sobrevive a uma
queda Google-wide. As chaves são deduplicadas (se a do usuário coincidir com uma
compartilhada, não tenta duas vezes). Se **não há nenhuma chave** ou todas falham, lança
`"IA indisponível. Última falha: ..."`.

### 4. Abstração por provedor na fronteira SSE

Gemini e Groq têm formatos de streaming diferentes; a diferença é isolada:

- **Request:** `geminiRequest()` (com `thinkingBudget: 0` para modelos 2.5) vs.
  `groqRequest()` (Chat Completions OpenAI-compatible, `Bearer` auth, `stream: true`).
- **Delta:** `extractDelta(provider, json)` — Gemini lê
  `candidates[0].content.parts[0].text`; Groq lê `choices[0].delta.content`.
- `sseToTextStream(upstream, provider)` generaliza a tradução do SSE upstream para o
  stream de texto plano que as rotas `/api/study` e `/api/study/chat` repassam.

### 5. Modelos default sem os 2.0 desligados

`GEMINI_MODELS` default = `gemini-2.5-flash,gemini-2.5-flash-lite` (os 2.0, desligados em
2026-06-01, foram removidos). `GROQ_MODELS` default =
`llama-3.3-70b-versatile,llama-3.1-8b-instant`. Ambos são sobrescrevíveis por env
(`GEMINI_GEN_MODELS` / `GROQ_GEN_MODELS`).

## Consequências

- **Custo do host ~US$ 0:** quem cadastra BYOK gasta a própria cota; o resto usa a rede
  compartilhada limitada + Groq. Nenhum plano pago é necessário para disponibilizar a
  terceiros.
- **Resiliência:** uma queda do Gemini (ou cota esgotada) cai para Groq automaticamente,
  sem intervenção. Antes, era ponto único de falha.
- **Segurança:** chaves de terceiros nunca trafegam de volta ao cliente nem ficam em texto
  puro. `APP_SECRET_KEY` é obrigatória em produção e **nunca** versionada com valor real
  (documentada no `.env.example`; gerar com `openssl rand -base64 32`).
- **Operação:** a migration `20260601230000_user_settings.sql` **precisa ser aplicada** ao
  banco (já aplicada no ambiente de dev). Sem `APP_SECRET_KEY`, o BYOK fica indisponível
  mas o estudo segue funcionando pela rede compartilhada / Groq.
- **Limitação:** o failover decide por chave/modelo apenas no **handshake** (primeiro
  byte). Uma falha *no meio* do stream (raro) não re-tenta outro provedor — o erro
  propaga ao cliente, que pode reenviar.
