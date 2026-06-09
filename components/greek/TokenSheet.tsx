'use client';

import { useEffect, useState } from 'react';
import type { LexiconEntry, Token } from '@/lib/corpus';
import { glossLabel, parsingLabel, posLabel } from '@/lib/morph-labels';
import { phoneticPtBR, transliterate } from '@/lib/transliterate';
import { fetchLexicon } from '@/app/compare/actions';

// Rótulos legíveis por fonte de léxico (coluna `lexicon_entries.source`).
const LEXICON_LABELS: Record<string, string> = {
  lsj: 'LSJ (Liddell-Scott-Jones)',
  thayers: "Thayer's",
  moulton_milligan: 'Moulton-Milligan',
};

// Áudio via Web Speech API (nativa, sem dependência).
// - Se houver voz grega (`el-*`) instalada, fala o grego — fonética moderna
//   (iotacismo), diverge da transliteração erasmiana, mas é a leitura nativa.
// - Sem voz grega, falar grego com `lang='el-GR'` deixa o Chrome MUDO; então
//   caímos para a transliteração (latim) lida pela voz padrão, garantindo som.
function speak(surface: string, romanized: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;

  const run = () => {
    const voices = synth.getVoices();
    const greek = voices.find((v) => v.lang?.toLowerCase().startsWith('el'));
    const fallback = voices.find((v) => v.default) ?? voices[0];
    const voice = greek ?? fallback;
    // Com voz grega, fala o grego nativo. Sem ela, fala a romanização — e, se a
    // voz padrão for portuguesa, usa a respelagem fonética para corrigir g/c/s.
    let text = surface;
    if (!greek) {
      text = voice?.lang?.toLowerCase().startsWith('pt') ? phoneticPtBR(romanized) : romanized;
    }
    const utter = new SpeechSynthesisUtterance(text);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    utter.rate = 0.85;
    synth.cancel();
    synth.speak(utter);
  };

  // Vozes carregam de forma assíncrona; na 1ª chamada getVoices() pode vir vazio.
  if (synth.getVoices().length === 0) {
    synth.addEventListener('voiceschanged', run, { once: true });
  } else {
    run();
  }
}

// Painel inferior com os dados linguísticos de um token grego: superfície,
// Strong's, pronúncia (transliteração + áudio), lema, glosa, análise morfológica,
// Abbott-Smith e os léxicos (LSJ etc.) buscados sob demanda.
export function TokenSheet({ token, onClose }: { token: Token; onClose: () => void }) {
  const gloss = glossLabel(token);
  const strongs = token.lemma?.strongs ?? null;
  const romanized = transliterate(token.surface);
  const [lexicon, setLexicon] = useState<LexiconEntry[] | null>(null);
  const [lexLoading, setLexLoading] = useState(false);

  // Fecha ao pressionar Escape — saída por teclado esperada de um diálogo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Busca as entradas de léxico (LSJ etc.) sob demanda ao abrir o painel. Não
  // viajam no payload do capítulo (entradas grandes). `ignore` evita aplicar o
  // resultado de um token anterior caso o usuário troque de token rapidamente.
  useEffect(() => {
    if (!strongs) {
      setLexicon([]);
      return;
    }
    let ignore = false;
    setLexLoading(true);
    setLexicon(null);
    fetchLexicon(strongs)
      .then((entries) => {
        if (!ignore) setLexicon(entries);
      })
      .catch(() => {
        if (!ignore) setLexicon([]);
      })
      .finally(() => {
        if (!ignore) setLexLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [strongs]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-greek text-3xl">{token.surface}</span>
          {token.lemma?.strongs && (
            <span className="text-xs text-neutral-400">Strong {token.lemma.strongs}</span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <p className="text-base italic text-neutral-400" aria-label="Pronúncia">
            {romanized}
          </p>
          <button
            type="button"
            onClick={() => speak(token.surface, romanized)}
            aria-label="Ouvir pronúncia"
            className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M13 4.06a1 1 0 0 0-1.6-.8L6.67 7H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.67l4.73 3.74A1 1 0 0 0 13 19.94zM16.5 8.5a1 1 0 0 1 1.41 0A4.98 4.98 0 0 1 19.5 12a4.98 4.98 0 0 1-1.59 3.5 1 1 0 1 1-1.32-1.5A2.98 2.98 0 0 0 17.5 12a2.98 2.98 0 0 0-.99-2 1 1 0 0 1-.01-1.5zM19.07 5.93a1 1 0 0 1 1.41 0A8.96 8.96 0 0 1 23 12a8.96 8.96 0 0 1-2.52 6.07 1 1 0 0 1-1.46-1.36A6.96 6.96 0 0 0 21 12a6.96 6.96 0 0 0-1.93-4.71 1 1 0 0 1 0-1.36z" />
            </svg>
          </button>
        </div>

        {token.lemma && (
          <p className="mt-2 text-sm text-neutral-500">
            Lema:{' '}
            <span className="font-greek text-base text-neutral-700 dark:text-neutral-200">
              {token.lemma.lemma}
            </span>
            <span className="ml-2 italic text-neutral-400">{transliterate(token.lemma.lemma)}</span>
          </p>
        )}

        {gloss && <p className="mt-3 text-lg font-medium">{gloss}</p>}

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-400">Classe</dt>
          <dd>{posLabel(token)}</dd>
          <dt className="text-neutral-400">Análise</dt>
          <dd>{parsingLabel(token)}</dd>
          {token.lemma?.gloss_en && token.lemma.gloss_en !== gloss && (
            <>
              <dt className="text-neutral-400">Glosa (EN)</dt>
              <dd className="text-neutral-500">{token.lemma.gloss_en}</dd>
            </>
          )}
        </dl>

        {token.lemma?.abbott_smith && (
          <section className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Abbott-Smith
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              {token.lemma.abbott_smith}
            </p>
          </section>
        )}

        {lexLoading && (
          <p className="mt-5 border-t border-neutral-200 pt-4 text-sm text-neutral-400 dark:border-neutral-800">
            Carregando léxico…
          </p>
        )}

        {lexicon?.map((entry) => (
          <section
            key={entry.source}
            className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {LEXICON_LABELS[entry.source] ?? entry.source.toUpperCase()}
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              {entry.text_pt ?? entry.text_en}
            </p>
            {entry.source === 'lsj' && (
              <p className="mt-2 text-[11px] text-neutral-400">
                LSJ via{' '}
                <a
                  href="https://github.com/STEPBible/STEPBible-Data"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  STEPBible
                </a>{' '}
                (CC BY 4.0)
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
