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
import { getStudyWorkspace } from '@/lib/saved-studies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Histórico injetado no prompt: últimas N trocas (mantém a conversa coerente sem
// estourar o contexto em estudos longos).
const MAX_HISTORY = 20;
// Limite defensivo do tamanho da mensagem do usuário (fronteira de confiança).
const MAX_MESSAGE_CHARS = 4000;

interface ChatRequest {
  studyId?: unknown;
  message?: unknown;
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
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!Number.isInteger(studyId)) return bad('Id do estudo inválido.');
  if (!message) return bad('Mensagem vazia.');
  if (message.length > MAX_MESSAGE_CHARS) return bad('Mensagem muito longa.');

  // 3) Carrega o workspace (RLS garante propriedade; null = não é do usuário).
  const workspace = await getStudyWorkspace(studyId);
  if (!workspace) return bad('Estudo não encontrado.', 404);

  // 4) Persiste a mensagem do usuário antes de gerar (não se perde se a IA falhar).
  const { error: insErr } = await supabase
    .from('study_messages')
    .insert({ study_id: studyId, user_id: user.id, role: 'user', content: message });
  if (insErr) return bad(insErr.message, 500);

  // 5) Monta contexto (versículos citados + fontes) e prompt (histórico + mensagem).
  const context = await buildChatContext(workspace.references, workspace.sources);
  const history = workspace.messages.slice(-MAX_HISTORY);
  const prompt = buildChatPrompt(context, history, message);

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
    const content = assistantText.trim();
    if (!content) return;
    await supabase
      .from('study_messages')
      .insert({ study_id: studyId, user_id: user.id, role: 'assistant', content });
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
