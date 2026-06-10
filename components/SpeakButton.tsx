'use client';

/**
 * Botão de pronúncia via Web Speech API (nativa, sem dependência). Extraído do
 * TokenSheet para servir também ao verbete do dicionário (grego e hebraico).
 *
 * - Se houver voz do idioma original instalada (grego `el-*` / hebraico `he-*`),
 *   fala o original — fonética moderna, diverge da acadêmica, mas é leitura nativa.
 * - Sem a voz, falar com lang estrangeiro deixa o Chrome MUDO; então caímos para a
 *   romanização lida pela voz padrão. Se a voz padrão for portuguesa e o texto for
 *   grego, usamos a respelagem fonética PT (corrige g/c/s); a pronúncia figurada do
 *   hebraico (campo pron do Strong's) já é legível como está.
 */
import { phoneticPtBR } from '@/lib/transliterate';

const VOICE_PREFIX: Record<'grc' | 'hbo', string> = { grc: 'el', hbo: 'he' };

function speak(text: string, romanized: string, lang: 'grc' | 'hbo') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;

  const run = () => {
    const voices = synth.getVoices();
    const native = voices.find((v) => v.lang?.toLowerCase().startsWith(VOICE_PREFIX[lang]));
    const fallback = voices.find((v) => v.default) ?? voices[0];
    const voice = native ?? fallback;

    let spoken = text;
    if (!native) {
      spoken =
        lang === 'grc' && voice?.lang?.toLowerCase().startsWith('pt')
          ? phoneticPtBR(romanized)
          : romanized;
    }
    const utter = new SpeechSynthesisUtterance(spoken);
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

export function SpeakButton({
  text,
  romanized,
  lang,
}: {
  text: string;
  /** leitura latina usada quando não há voz nativa do idioma. */
  romanized: string;
  lang: 'grc' | 'hbo';
}) {
  return (
    <button
      type="button"
      onClick={() => speak(text, romanized, lang)}
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
  );
}
