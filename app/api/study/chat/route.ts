/**
 * Route Handler do CHAT de um estudo-workspace: recebe { studyId, message },
 * persiste a mensagem do usuário, monta o contexto a partir do material curado
 * (versículos citados + fontes do usuário) e devolve a resposta do Gemini em
 * STREAMING. Ao fim do stream, persiste a resposta do assistente.
 *
 * Gate de autenticação + propriedade: só o dono do estudo conversa nele. Isso
 * protege a chave do Gemini de abuso anônimo e isola os dados por usuário (RLS).
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { streamChatText } from '@/lib/gemini';
import { getUserGeminiKey } from '@/lib/user-settings';
import { buildChatContext, buildChatPrompt, STUDY_CHAT_SYSTEM } from '@/lib/study';
import { getStudyWorkspace, backfillFileSources } from '@/lib/saved-studies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Respostas longas em streaming podem ultrapassar o limite padrão (~10s) da
// função no Vercel free tier e ser cortadas no meio. 60s é o teto do Hobby.
export const maxDuration = 60;

// Histórico injetado no prompt: últimas N trocas (mantém a conversa coerente sem
// estourar o contexto em estudos longos).
const MAX_HISTORY = 20;
// Limite defensivo do tamanho da mensagem do usuário (fronteira de confiança).
const MAX_MESSAGE_CHARS = 4000;

// Ação da requisição:
//  - 'send'       → fluxo normal: persiste a mensagem do usuário e responde.
//  - 'regenerate' → refaz a ÚLTIMA resposta: apaga o assistente final e gera de
//                   novo a partir da última pergunta do usuário (sem nova entrada).
//  - 'continue'   → continua a resposta anterior de onde parou (sem nova entrada).
type ChatAction = 'send' | 'regenerate' | 'continue';

interface ChatRequest {
  studyId?: unknown;
  message?: unknown;
  action?: unknown;
}

// Instrução injetada como "pergunta" no modo continuar — pede ao modelo retomar
// o fio sem repetir o que já foi escrito.
const CONTINUE_INSTRUCTION =
  'Continue a resposta anterior exatamente de onde parou, sem repetir o que já foi escrito e sem reabrir a introdução.';

function parseAction(value: unknown): ChatAction {
  return value === 'regenerate' || value === 'continue' ? value : 'send';
}

function bad(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function POST(req: Request): Promise<Response> {
  // 1) Gate de autenticação.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad('Faça login para conversar no estudo.', 401);

  // 2) Validação do corpo.
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return bad('Corpo inválido (esperado JSON).');
  }
  const studyId = typeof body.studyId === 'number' ? body.studyId : Number(body.studyId);
  const action = parseAction(body.action);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!Number.isInteger(studyId)) return bad('Id do estudo inválido.');
  // No modo 'send' a mensagem é obrigatória; nos modos derivados ela é ignorada.
  if (action === 'send') {
    if (!message) return bad('Mensagem vazia.');
    if (message.length > MAX_MESSAGE_CHARS) return bad('Mensagem muito longa.');
  }

  // 3) Carrega o workspace (RLS garante propriedade; null = não é do usuário).
  const workspace = await getStudyWorkspace(studyId);
  if (!workspace) return bad('Estudo não encontrado.', 404);

  // 4) Resolve a "pergunta atual", o histórico e o destino da persistência conforme
  //    a ação. Para manter cliente e servidor com o MESMO formato de thread (1 linha
  //    por turno), regenerate e continue ATUALIZAM a linha do assistente existente em
  //    vez de criar uma nova — assim o estado ao recarregar bate com o estado ao vivo,
  //    e um Refazer posterior não regenera a partir de um prompt obsoleto.
  const msgs = [...workspace.messages]; // cópia local: não mutamos o workspace carregado
  let promptMessage: string;
  let history = msgs.slice(-MAX_HISTORY);
  // Quando definido, a resposta gerada SUBSTITUI/ESTENDE esta linha (update) em vez de
  // inserir uma nova. `mergeBase` (continue) é o texto a preservar antes do novo.
  let updateTargetId: number | null = null;
  let mergeBase = '';

  if (action === 'regenerate') {
    const last = msgs[msgs.length - 1];
    // A última pergunta do usuário vira a "pergunta atual"; o histórico é o que a antecede.
    const lastUserIdx = msgs.map((m) => m.role).lastIndexOf('user');
    const lastUser = lastUserIdx === -1 ? undefined : msgs[lastUserIdx];
    if (!lastUser) return bad('Não há pergunta para refazer.');
    promptMessage = lastUser.content;
    history = msgs.slice(0, lastUserIdx).slice(-MAX_HISTORY);
    // Reaproveita a linha do assistente final (será sobrescrita só se o novo texto
    // não vier vazio — sem isso, uma geração vazia apagaria a resposta anterior).
    if (last?.role === 'assistant') updateTargetId = last.id;
  } else if (action === 'continue') {
    // continue: mantém todo o histórico (inclusive a resposta a continuar) e injeta
    // a instrução de continuação como pergunta atual. O novo texto é ANEXADO à mesma
    // linha do assistente (mergeBase + novo), nunca uma linha nova.
    const last = msgs[msgs.length - 1];
    if (last?.role !== 'assistant') return bad('Não há resposta para continuar.');
    promptMessage = CONTINUE_INSTRUCTION;
    updateTargetId = last.id;
    mergeBase = last.content;
  } else {
    // send: persiste a mensagem do usuário antes de gerar (não se perde se a IA falhar).
    const { error: insErr } = await supabase
      .from('study_messages')
      .insert({ study_id: studyId, user_id: user.id, role: 'user', content: message });
    if (insErr) return bad(insErr.message, 500);
    promptMessage = message;
  }

  // 5) Monta contexto (versículos citados + fontes) e prompt (histórico + mensagem).
  //    Antes, garante o texto das fontes-arquivo (extrai PDFs enviados antes da
  //    extração existir) para que o conteúdo delas chegue ao modelo.
  const sources = await backfillFileSources(workspace.sources);
  const context = await buildChatContext(
    workspace.references,
    sources,
    workspace.study.content,
  );
  const prompt = buildChatPrompt(context, history, promptMessage);

  // 6) Gera em streaming. A resposta é persistida tanto na conclusão normal quanto
  //    se o cliente abortar no meio (cancel) — um TransformStream.flush() NÃO roda
  //    quando o consumidor cancela, então usamos um ReadableStream com pull+cancel
  //    para não perder o parcial e manter o thread consistente ao recarregar.
  const userGeminiKey = await getUserGeminiKey();
  let geminiStream: ReadableStream<Uint8Array>;
  try {
    geminiStream = await streamChatText({ system: STUDY_CHAT_SYSTEM, prompt, userGeminiKey });
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Falha ao gerar a resposta.', 502);
  }

  const reader = geminiStream.getReader();
  const decoder = new TextDecoder();
  let assistantText = '';
  let persisted = false;

  const persistAssistant = async () => {
    if (persisted) return;
    persisted = true;
    const generated = assistantText.trim();
    // Geração vazia: não toca no banco. Em regenerate/continue isso PRESERVA a
    // resposta anterior (a linha-alvo fica intacta), evitando perda de dado.
    if (!generated) return;
    if (updateTargetId != null) {
      // regenerate: substitui o conteúdo; continue: anexa ao texto preservado.
      const content = mergeBase ? `${mergeBase}\n${generated}` : generated;
      await supabase.from('study_messages').update({ content }).eq('id', updateTargetId);
    } else {
      await supabase
        .from('study_messages')
        .insert({ study_id: studyId, user_id: user.id, role: 'assistant', content: generated });
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          assistantText += decoder.decode(); // flush de bytes UTF-8 pendentes
          await persistAssistant();
          controller.close();
          return;
        }
        assistantText += decoder.decode(value, { stream: true });
        controller.enqueue(value);
      } catch (e) {
        await persistAssistant(); // erro no meio: salva o que já foi gerado
        controller.error(e);
      }
    },
    async cancel() {
      // Cliente abortou: persiste o parcial e encerra o upstream do Gemini.
      assistantText += decoder.decode();
      await persistAssistant();
      await reader.cancel();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
