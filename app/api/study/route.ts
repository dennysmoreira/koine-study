/**
 * Route Handler do "Estudo com IA": recebe um capítulo + versões selecionadas +
 * modo e devolve, em STREAMING, o texto gerado pelo Gemini fundamentado no
 * material do capítulo (grego + traduções + glossário).
 *
 * Gate de autenticação: exige usuário logado. Isso protege a chave do Gemini de
 * abuso anônimo — a geração é cara e a rota é pública por URL.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { streamChatText } from '@/lib/gemini';
import { getUserGeminiKey } from '@/lib/user-settings';
import { buildStudyContext, buildStudyPrompt, STUDY_SYSTEM } from '@/lib/study';
import { isStudyMode, getStudyMode } from '@/lib/study-modes';

// Precisa de Node (server-only deps) e nunca pode ser cacheado (resposta em stream).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Respostas longas em streaming podem ultrapassar o limite padrão (~10s) da
// função no Vercel free tier e ser cortadas no meio. 60s é o teto do Hobby.
export const maxDuration = 60;

interface StudyRequest {
  osis?: unknown;
  chapter?: unknown;
  codes?: unknown;
  mode?: unknown;
  prompt?: unknown;
}

function bad(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function POST(req: Request): Promise<Response> {
  // 1) Gate de autenticação (protege a chave do Gemini).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return bad('Faça login para usar o Estudo com IA.', 401);
  }

  // 2) Validação do corpo.
  let body: StudyRequest;
  try {
    body = (await req.json()) as StudyRequest;
  } catch {
    return bad('Corpo inválido (esperado JSON).');
  }

  const osis = typeof body.osis === 'string' ? body.osis : '';
  const chapter = typeof body.chapter === 'number' ? body.chapter : Number(body.chapter);
  const codes = Array.isArray(body.codes) ? body.codes.filter((c): c is string => typeof c === 'string') : [];
  const mode = body.mode;
  const userPrompt = typeof body.prompt === 'string' ? body.prompt : '';

  if (!osis || !Number.isInteger(chapter) || chapter < 1) {
    return bad('Informe um livro (osis) e um capítulo válidos.');
  }
  if (!isStudyMode(mode)) {
    return bad('Modo de estudo inválido.');
  }
  if (getStudyMode(mode).needsPrompt && !userPrompt.trim()) {
    return bad('Este modo exige uma pergunta.');
  }

  // 3) Monta o contexto do capítulo (grego + traduções + glossário).
  const context = await buildStudyContext(osis, chapter, codes);
  if (!context) {
    return bad('Capítulo não encontrado.', 404);
  }

  // 4) Gera em streaming.
  const prompt = buildStudyPrompt(mode, context.text, userPrompt);
  try {
    const userGeminiKey = await getUserGeminiKey();
    const stream = await streamChatText({ system: STUDY_SYSTEM, prompt, userGeminiKey });
    return new Response(stream, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Falha ao gerar o estudo.', 502);
  }
}
