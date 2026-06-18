'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Book } from '@/lib/corpus';
import type { ChapterView, ChapterViewRow, LeanHebrewWord, LeanToken } from '@/lib/chapter-view';
import type { Translation } from '@/lib/translations';
import { GreekVerse } from './greek/GreekVerse';
import { TokenSheet } from './greek/TokenSheet';
import { HebrewVerse } from './hebrew/HebrewVerse';
import { HebrewWordSheet } from './hebrew/HebrewWordSheet';
import { StudyModal } from './StudyModal';
import { VerseSelectionBar } from './VerseSelectionBar';
import { AnnotationSheet } from './AnnotationSheet';
import { CrossRefsSheet } from './CrossRefsSheet';
import { ReaderHelp } from './ReaderHelp';
import { BottomSheet } from './BottomSheet';
import type { ReferenceInput } from '@/app/study/actions';
import type { Annotation, CrossRef } from '@/lib/annotations';
import type { HighlightColor } from '@/lib/highlight-colors';
import { getBookChapters, getChapterVerses } from '@/app/compare/actions';
import { loadSelectionDraft, clearSelectionDraft } from '@/lib/selection-draft';
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  loadFontSize,
  saveFontSize,
  type ReaderFontSize,
} from '@/lib/reader-prefs';

const TESTAMENT_LABELS: Record<string, string> = {
  NT: 'Novo Testamento',
  OT: 'Antigo Testamento',
};

// Altura aproximada do header fixo de 2 linhas, em px. Compartilhada entre o
// rootMargin do observer de versículo e o scroll-mt dos versículos — se o header
// mudar de altura, ajustar aqui (e o scroll-mt-20 nas linhas de versículo).
const HEADER_OFFSET_PX = 80;

// Validação única do parâmetro ?goto (versículo de destino): inteiro positivo.
function parseGoto(raw: string | null): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Monta a URL do comparador preservando as versões selecionadas. `goto` (quando
// informado) pede ao comparador para rolar/realçar aquele versículo ao montar.
function compareHref(osis: string, chapter: number, codes: string[], goto?: number): string {
  const params: string[] = [];
  if (codes.length > 0) params.push(`v=${codes.join(',')}`);
  if (goto != null) params.push(`goto=${goto}`);
  const q = params.length > 0 ? `?${params.join('&')}` : '';
  return `/compare/${osis}/${chapter}${q}`;
}

// Sheet de navegação: cascata Livro → Capítulo → Versículo, escolhidos de uma vez.
// Capítulos e versículos do livro escolhido vêm de server actions sob demanda
// (não só do livro já carregado). Escolher um versículo navega para a rota
// (preservando as versões) com `goto` para rolar até ele — ou, se já estamos no
// capítulo carregado, apenas rola a página atual sem refetch.
function NavSheet({
  books,
  current,
  chapter,
  chapters,
  rows,
  codes,
  onClose,
  onVerse,
}: {
  books: Book[];
  current: Book;
  chapter: number;
  chapters: number[];
  rows: ChapterViewRow[];
  codes: string[];
  onClose: () => void;
  onVerse: (verse: number) => void;
}) {
  const router = useRouter();

  const [selectedOsis, setSelectedOsis] = useState(current.osis_code);
  const [chapterList, setChapterList] = useState<number[]>(chapters);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(chapter);
  const [verseList, setVerseList] = useState<number[]>(rows.map((r) => r.verse));
  const [loadingVerses, setLoadingVerses] = useState(false);

  // Token de requisição: descarta resultados de fetches obsoletos quando o
  // usuário troca de livro/capítulo rápido (evita aplicar uma resposta antiga).
  const reqId = useRef(0);

  const groups = new Map<string, Book[]>();
  for (const b of books) {
    const list = groups.get(b.testament) ?? [];
    list.push(b);
    groups.set(b.testament, list);
  }

  const isLoadedChapter = (osis: string, ch: number | null) =>
    osis === current.osis_code && ch === chapter;

  const onBookChange = async (osis: string) => {
    setSelectedOsis(osis);
    setSelectedChapter(null);
    setVerseList([]);
    if (osis === current.osis_code) {
      setChapterList(chapters);
      return;
    }
    const id = ++reqId.current;
    setLoadingChapters(true);
    try {
      const list = await getBookChapters(osis);
      if (id === reqId.current) setChapterList(list);
    } finally {
      if (id === reqId.current) setLoadingChapters(false);
    }
  };

  const onChapterSelect = async (ch: number) => {
    setSelectedChapter(ch);
    if (isLoadedChapter(selectedOsis, ch)) {
      setVerseList(rows.map((r) => r.verse)); // já temos os versículos do prop
      return;
    }
    const id = ++reqId.current;
    setVerseList([]);
    setLoadingVerses(true);
    try {
      const list = await getChapterVerses(selectedOsis, ch);
      if (id === reqId.current) setVerseList(list);
    } finally {
      if (id === reqId.current) setLoadingVerses(false);
    }
  };

  const goToChapterTop = () => {
    if (selectedChapter == null) return;
    router.push(compareHref(selectedOsis, selectedChapter, codes));
    onClose();
  };

  const onVerseSelect = (verse: number) => {
    if (selectedChapter == null) return;
    if (isLoadedChapter(selectedOsis, selectedChapter)) {
      onVerse(verse); // capítulo já renderizado: rola na própria página
      return;
    }
    router.push(compareHref(selectedOsis, selectedChapter, codes, verse));
    onClose();
  };

  return (
    <BottomSheet onClose={onClose} ariaLabel="Navegar: livro, capítulo e versículo" maxHeightClass="max-h-[80dvh]">
        <label htmlFor="cmp-book" className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Livro
        </label>
        <select
          id="cmp-book"
          value={selectedOsis}
          onChange={(e) => onBookChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
        >
          {[...groups.entries()].map(([testament, list]) => (
            <optgroup key={testament} label={TESTAMENT_LABELS[testament] ?? testament}>
              {list.map((b) => (
                <option key={b.id} value={b.osis_code}>
                  {b.name_pt}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Capítulo</p>
        {loadingChapters ? (
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Carregando capítulos…</p>
        ) : (
          <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-10">
            {chapterList.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChapterSelect(n)}
                className={`flex h-9 items-center justify-center rounded-md text-sm transition ${
                  n === selectedChapter
                    ? 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                    : 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {selectedChapter != null && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Versículo</p>
              {!isLoadedChapter(selectedOsis, selectedChapter) && (
                <button
                  type="button"
                  onClick={goToChapterTop}
                  className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                >
                  Abrir capítulo →
                </button>
              )}
            </div>
            {loadingVerses ? (
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Carregando versículos…</p>
            ) : (
              <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-10">
                {verseList.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onVerseSelect(v)}
                    className="flex h-9 items-center justify-center rounded-md bg-neutral-100 text-sm transition hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
    </BottomSheet>
  );
}

// Linha de versão no seletor: rótulo, sublinha e estado de marcação.
function VersionRow({
  on,
  title,
  subtitle,
  onClick,
}: {
  on: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
        on
          ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
          : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
      }`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</span>
      </span>
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
          on
            ? 'border-amber-500 bg-amber-500 text-amber-950'
            : 'border-neutral-300 text-transparent dark:border-neutral-600'
        }`}
      >
        ✓
      </span>
    </button>
  );
}

// Sheet de seleção de versões. Pelo menos uma versão deve permanecer ativa.
function VersionSheet({
  all,
  selected,
  osis,
  chapter,
  onClose,
}: {
  all: Translation[];
  selected: string[];
  osis: string;
  chapter: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const selectedSet = new Set(selected);

  // As duas linhas is_original (grego e hebraico) são UMA opção lógica no
  // seletor — "Texto Original". O servidor já troca grego↔hebraico conforme o
  // testamento do livro, então aqui basta um código representante (o de menor
  // sort_order) ao ligar; ao desligar, removemos qualquer original.
  const originals = all.filter((t) => t.is_original);
  const others = all.filter((t) => !t.is_original);
  const originalCodeSet = new Set(originals.map((t) => t.code));
  const repOriginalCode = originals[0]?.code ?? null;
  const anyOriginalOn = selected.some((c) => originalCodeSet.has(c));

  // preserva a ordem do catálogo (sort_order) ao reconstruir os códigos
  const orderByCatalog = (codes: string[]) => {
    const set = new Set(codes);
    return all.filter((t) => set.has(t.code)).map((t) => t.code);
  };

  const push = (codes: string[]) => router.push(compareHref(osis, chapter, orderByCatalog(codes)));

  const toggleOriginal = () => {
    if (anyOriginalOn) {
      const remaining = selected.filter((c) => !originalCodeSet.has(c));
      if (remaining.length === 0) return; // mantém ao menos uma versão
      push(remaining);
    } else if (repOriginalCode) {
      push([...selected, repOriginalCode]);
    }
  };

  const toggleOther = (code: string) => {
    const next = new Set(selectedSet);
    if (next.has(code)) {
      if (next.size === 1) return; // mantém ao menos uma versão
      next.delete(code);
    } else {
      next.add(code);
    }
    push([...next]);
  };

  return (
    <BottomSheet onClose={onClose} ariaLabel="Versões para comparar">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Versões</h2>
        <div className="mt-3 flex flex-col gap-2">
          {originals.length > 0 && (
            <VersionRow
              on={anyOriginalOn}
              title="Texto Original"
              subtitle="Grego (NT) · Hebraico (AT)"
              onClick={toggleOriginal}
            />
          )}
          {others.map((t) => (
            <VersionRow
              key={t.code}
              on={selectedSet.has(t.code)}
              title={t.name}
              subtitle={t.language.toUpperCase()}
              onClick={() => toggleOther(t.code)}
            />
          ))}
        </div>
        {all.length <= 1 && (
          <p className="mt-4 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Só o texto grego original está disponível por enquanto. Novas versões aparecerão
            aqui automaticamente quando forem licenciadas.
          </p>
        )}
    </BottomSheet>
  );
}

// Tinta de fundo por cor de destaque (sutil; dark-mode aware). Cede lugar ao
// realce transitório (goto) e à seleção, que têm prioridade visual.
const HIGHLIGHT_TINT: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-100/70 dark:bg-yellow-500/10',
  green: 'bg-green-100/70 dark:bg-green-500/10',
  blue: 'bg-sky-100/70 dark:bg-sky-500/10',
  pink: 'bg-pink-100/70 dark:bg-pink-500/10',
  purple: 'bg-violet-100/70 dark:bg-violet-500/10',
};

export function Comparator({
  chapter,
  books,
  allTranslations,
  annotations,
  highlights,
  isAuthenticated,
}: {
  chapter: ChapterView;
  books: Book[];
  allTranslations: Translation[];
  annotations: Annotation[];
  /** verso → cor do marca-texto do usuário (vazio se anônimo). */
  highlights: Record<number, HighlightColor>;
  /** Sessão ativa? Gateia ações que exigem conta na barra de seleção. */
  isAuthenticated: boolean;
}) {
  const { book, number, chapters, translations, rows, greekLexicon, hebrewLexicon } = chapter;
  const [navOpen, setNavOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  // Modo de seleção de versículos (para citar/explicar). Quando ativo, cada linha
  // ganha uma caixa de seleção; a barra de ação aparece com 1+ selecionados.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  // Rascunho re-hidratado do gate anônimo (ver lib/selection-draft): ao voltar
  // autenticado, o compositor de anotação reabre com o texto/refs que o usuário
  // tinha digitado antes de ser mandado ao login. `undefined` = sem re-hidratação.
  const [draftNote, setDraftNote] = useState<string | undefined>(undefined);
  const [draftRefs, setDraftRefs] = useState<CrossRef[] | undefined>(undefined);
  const [draftAutoCompose, setDraftAutoCompose] = useState(false);
  const rehydratedRef = useRef(false);
  // Token grego selecionado (abre o TokenSheet com os dados linguísticos).
  const [selected, setSelected] = useState<{ verse: number; token: LeanToken } | null>(null);
  // Palavra hebraica selecionada (abre o HebrewWordSheet, breakdown por morfema).
  const [selectedHebrew, setSelectedHebrew] = useState<{ verse: number; word: LeanHebrewWord } | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const highlightTimer = useRef<number | null>(null);
  // Versículo cujas anotações estão abertas na folha de leitura (marcador 📝).
  const [annotationVerse, setAnnotationVerse] = useState<number | null>(null);
  // Versículo cujas referências cruzadas (TSK) estão abertas (toque no número).
  const [crossRefVerse, setCrossRefVerse] = useState<number | null>(null);
  // Tamanho da fonte de leitura (preferência Aa). Começa no default no SSR e
  // assume o valor salvo após a montagem — evita divergência de hidratação.
  const [fontSize, setFontSize] = useState<ReaderFontSize>(DEFAULT_FONT_SIZE);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  // Leitura em voz alta (Web Speech): fala os versículos da tradução em sequência,
  // destacando e rolando até o atual. 'paused' espelha synth.pause/resume.
  const [listening, setListening] = useState(false);
  const [listenPaused, setListenPaused] = useState(false);
  const [speakingVerse, setSpeakingVerse] = useState<number | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    setFontSize(loadFontSize());
  }, []);

  // Esc fecha o popover de fonte (consistente com os sheets).
  useEffect(() => {
    if (!fontMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFontMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fontMenuOpen]);

  const pickFontSize = (size: ReaderFontSize) => {
    setFontSize(size);
    saveFontSize(size);
    setFontMenuOpen(false);
  };

  // Índice versículo → anotações que o cobrem (faixa verse_start..verse_end), para
  // marcar no comparador e abrir a folha de leitura ao tocar no marcador. Memoizado
  // para não reconstruir o Map a cada render (só quando as anotações mudam).
  const annotationsByVerse = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const a of annotations) {
      for (let v = a.verseStart; v <= a.verseEnd; v++) {
        const list = map.get(v) ?? [];
        list.push(a);
        map.set(v, list);
      }
    }
    return map;
  }, [annotations]);

  // Limpa o timer do realce ao desmontar, evitando setState após unmount.
  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
  }, []);

  // Versículo "atual" da leitura: o mais alto (menor número) que cruza a faixa
  // superior da viewport. Alimenta a retomada exata ("Continuar lendo" → ?goto)
  // e o chip flutuante de posição. IntersectionObserver com rootMargin que
  // desconta o header fixo e ignora o terço inferior da tela (viés para o topo).
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);
  // Estado do auto-hide do header e do chip flutuante (efeito de scroll abaixo).
  const [headerHidden, setHeaderHidden] = useState(false);
  const [scrolledFar, setScrolledFar] = useState(false);

  // O Comparator NÃO remonta na navegação client-side entre capítulos (mesma
  // posição na árvore) — estado sobreviveria à troca. Reset SÍNCRONO durante o
  // render (padrão "adjusting state during render"): aplica antes de qualquer
  // efeito, então o efeito de persistência nunca vê o versículo do capítulo
  // anterior pareado com o capítulo novo, e o header reaparece no capítulo novo.
  const chapterKey = `${book.osis_code}:${number}`;
  const [prevChapterKey, setPrevChapterKey] = useState(chapterKey);
  if (prevChapterKey !== chapterKey) {
    setPrevChapterKey(chapterKey);
    setCurrentVerse(null);
    setHeaderHidden(false);
  }

  useEffect(() => {
    const visible = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = Number(e.target.id.slice(1));
          if (!Number.isInteger(v) || v < 1) continue;
          if (e.isIntersecting) visible.add(v);
          else visible.delete(v);
        }
        if (visible.size > 0) setCurrentVerse(Math.min(...visible));
      },
      { rootMargin: `-${HEADER_OFFSET_PX}px 0px -55% 0px` },
    );
    for (const row of rows) {
      if (row.verse < 1) continue; // v0 = título de salmo, não conta posição
      const el = document.getElementById(`v${row.verse}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [rows]);

  // ── Ouvir o capítulo ──
  // Token de SESSÃO: callbacks encadeados (onend/onerror, voiceschanged tardio)
  // só agem se a sessão capturada ainda for a atual — cancelar/trocar de capítulo
  // invalida a sessão e os callbacks órfãos viram no-op (sem corrida entre rotas).
  const listenSession = useRef(0);
  const pendingVoicesRun = useRef<(() => void) | null>(null);

  const stopListening = () => {
    listenSession.current++;
    if (pendingVoicesRun.current) {
      window.speechSynthesis?.removeEventListener('voiceschanged', pendingVoicesRun.current);
      pendingVoicesRun.current = null;
    }
    window.speechSynthesis?.cancel();
    setListening(false);
    setListenPaused(false);
    setSpeakingVerse(null);
  };

  function startListening() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const code = translations.find((t) => !t.is_original)?.code;
    if (!code) return;
    const items = rows
      .filter((r) => r.verse >= 1 && r.texts[code])
      .map((r) => ({ verse: r.verse, text: r.texts[code] as string }));
    if (items.length === 0) return;

    const session = ++listenSession.current;

    const run = () => {
      pendingVoicesRun.current = null;
      if (listenSession.current !== session) return; // sessão cancelada enquanto esperava vozes
      synth.cancel();
      const voices = synth.getVoices();
      const pt = voices.find((v) => v.lang?.toLowerCase().startsWith('pt'));
      setListening(true);
      setListenPaused(false);

      let i = 0;
      const speakNext = () => {
        if (listenSession.current !== session) return;
        const item = items[i++];
        if (!item) {
          stopListening();
          return;
        }
        setSpeakingVerse(item.verse);
        document.getElementById(`v${item.verse}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const u = new SpeechSynthesisUtterance(item.text);
        if (pt) {
          u.voice = pt;
          u.lang = pt.lang;
        }
        u.rate = 0.95;
        u.onend = speakNext;
        u.onerror = () => {
          if (listenSession.current === session) stopListening();
        };
        synth.speak(u);
      };
      speakNext();
    };

    // Vozes carregam de forma assíncrona; na 1ª chamada getVoices() pode vir vazio.
    if (synth.getVoices().length === 0) {
      pendingVoicesRun.current = run;
      synth.addEventListener('voiceschanged', run, { once: true });
    } else {
      run();
    }
  }

  const toggleListenPause = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (listenPaused) {
      synth.resume();
      setListenPaused(false);
    } else {
      synth.pause();
      setListenPaused(true);
    }
  };

  // Encerra a fala ao trocar de capítulo ou desmontar: invalida a sessão, remove
  // um voiceschanged pendente (senão falaria o capítulo ANTERIOR quando as vozes
  // carregassem) e cancela a fila de utterances.
  useEffect(() => {
    return () => {
      // refs aqui são CONTADOR/HANDLER mutáveis (não nós React): o cleanup deve
      // ler o valor ATUAL de propósito — o aviso exhaustive-deps não se aplica.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      listenSession.current++;
      if (pendingVoicesRun.current) {
        window.speechSynthesis?.removeEventListener('voiceschanged', pendingVoicesRun.current);
        pendingVoicesRun.current = null;
      }
      window.speechSynthesis?.cancel();
    };
  }, [chapterKey]);

  // Rastreio de rolagem (um listener só, com rAF): direção alimenta o auto-hide
  // do header (esconde ao descer, volta ao subir — leitura imersiva) e a distância
  // alimenta o chip flutuante de posição. Histerese de 8px evita tremedeira; perto
  // do topo o header nunca esconde.
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY;
        if (y < 120) setHeaderHidden(false);
        else if (dy > 8) setHeaderHidden(true);
        else if (dy < -8) setHeaderHidden(false);
        setScrolledFar(y > window.innerHeight);
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Memória do "último lido": livro/capítulo/versículo. O redirector de /compare
  // e o card "Continuar lendo" da home usam isto para retomar a leitura no lugar
  // exato (?goto), não só no capítulo.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        'koine:compare:last',
        JSON.stringify({ osis: book.osis_code, chapter: number, verse: currentVerse ?? undefined }),
      );
    } catch {
      // localStorage indisponível (modo privado/SSR) — apenas não persiste.
    }
  }, [book.osis_code, number, currentVerse]);

  const codes = translations.map((t) => t.code);
  const codesKey = codes.join(',');

  // Memória das versões escolhidas. Persiste a seleção SÓ quando ela é explícita na
  // URL (?v) — ou seja, resultado de uma escolha do usuário. Entradas sem ?v (padrão
  // do servidor) NÃO sobrescrevem a preferência, senão o padrão apagaria o salvo.
  useEffect(() => {
    if (!searchParams.get('v')) return;
    try {
      window.localStorage.setItem('koine:compare:versions', JSON.stringify(codes));
    } catch {
      // localStorage indisponível (modo privado) — apenas não persiste.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codesKey]);

  // Reaplica a preferência salva quando a URL NÃO traz versões: troca para a última
  // seleção do usuário em vez de cair no padrão do servidor. Uma vez por montagem;
  // após o replace a URL passa a ter ?v e o guard impede repetir/entrar em loop.
  const appliedVersionPref = useRef(false);
  useEffect(() => {
    if (appliedVersionPref.current || searchParams.get('v')) return;
    appliedVersionPref.current = true;
    try {
      const parsed = JSON.parse(window.localStorage.getItem('koine:compare:versions') ?? 'null') as unknown;
      if (!Array.isArray(parsed)) return;
      // mantém só códigos conhecidos do catálogo (versão removida é descartada).
      const saved = parsed.filter(
        (c): c is string => typeof c === 'string' && allTranslations.some((t) => t.code === c),
      );
      if (saved.length > 0 && saved.join(',') !== codesKey) {
        // Preserva um ?goto pendente (ex.: "Continuar lendo" chega sem ?v mas com
        // goto) — sem isso o replace descartaria a rolagem até o versículo salvo.
        const goto = parseGoto(searchParams.get('goto'));
        router.replace(compareHref(book.osis_code, number, saved, goto ?? undefined));
      }
    } catch {
      // localStorage/JSON inválido — mantém o padrão.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const original = translations.find((t) => t.is_original) ?? null;
  const originalCode = original?.code ?? null;
  // Língua da coluna original define o tratamento tipográfico: grego (LTR,
  // font-greek) ou hebraico (RTL, font-hebrew). É uma só coluna lógica que muda
  // conforme o testamento do livro.
  const originalIsHebrew = original?.language === 'hbo';
  const idx = chapters.indexOf(number);
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;

  // Swipe horizontal para trocar de capítulo (gesto natural de "virar página").
  // Critérios: deslocamento horizontal ≥ 70px, dominância horizontal (2× o
  // vertical), fora do modo seleção, sem sheet aberto e sem texto selecionado
  // (senão o gesto de selecionar texto viraria navegação acidental). Declarado
  // APÓS prev/next/codesKey: o deps array é avaliado no render (TDZ).
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      const t0 = e.touches.length === 1 ? e.touches[0] : undefined;
      if (!t0) return;
      startX = t0.clientX;
      startY = t0.clientY;
      tracking = true;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (selectMode || navOpen || versionsOpen || studyOpen) return;
      if (document.querySelector('[role="dialog"]')) return; // qualquer sheet aberto
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return; // usuário selecionando texto

      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;

      // swipe p/ esquerda = avançar; p/ direita = voltar
      const target = dx < 0 ? next : prev;
      if (target != null) {
        router.push(compareHref(book.osis_code, target, codesKey ? codesKey.split(',') : []));
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [selectMode, navOpen, versionsOpen, studyOpen, prev, next, codesKey, book.osis_code, router]);

  // colunas dinâmicas: estilo inline (o JIT do Tailwind não gera grid-cols-N
  // arbitrário). Só vale no breakpoint `sm` (sm:grid); no mobile empilha.
  const gridStyle = { gridTemplateColumns: `repeat(${translations.length}, minmax(0, 1fr))` };

  // Realça um versículo por 2s (transitório). Extraído para reuso pela rolagem
  // in-page e pelo deep-link (?goto), que querem o mesmo destaque âmbar.
  const flashHighlight = (verse: number) => {
    setHighlight(verse);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(
      () => setHighlight((cur) => (cur === verse ? null : cur)),
      2000,
    );
  };

  const goToVerse = (verse: number) => {
    setNavOpen(false);
    flashHighlight(verse);
    requestAnimationFrame(() => {
      document.getElementById(`v${verse}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Deep-link de versículo: ao chegar via filtro (?goto=N), rola até o versículo e
  // o realça. A rolagem usa retry curto porque o capítulo recém-montado ainda
  // assenta o layout (um rAF único viraria no-op). A limpeza do `goto` da URL é
  // feita com history.replaceState — NÃO com router.replace — pois um replace
  // dispara re-render do Next que cancela a rolagem em andamento.
  // `lastGoto` guarda o ÚLTIMO versículo já tratado (não um booleano): assim um
  // novo ?goto no MESMO capítulo (ex.: clicar outra referência relacionada) volta
  // a rolar, mas o replaceState que limpa a URL não reabre o efeito. Só é marcado
  // DENTRO do tick bem-sucedido: marcá-lo antes quebra no StrictMode
  // (mount→cleanup→mount cancela o 1º timer e o 2º mount abortaria).
  const lastGoto = useRef<number | null>(null);
  useEffect(() => {
    const verse = parseGoto(searchParams.get('goto'));
    if (verse == null || lastGoto.current === verse) return;

    let tries = 0;
    let timer = 0;
    const tick = () => {
      const el = document.getElementById(`v${verse}`);
      if (el) {
        lastGoto.current = verse;
        el.scrollIntoView({ block: 'start' });
        flashHighlight(verse);
        const url = new URL(window.location.href);
        url.searchParams.delete('goto');
        window.history.replaceState(window.history.state, '', url.pathname + url.search);
        return;
      }
      if (tries++ < 40) timer = window.setTimeout(tick, 50);
    };
    timer = window.setTimeout(tick, 50);
    return () => window.clearTimeout(timer);
    // flashHighlight é estável o bastante para este efeito de mount/troca de rota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Re-hidratação do rascunho do gate anônimo: ao montar JÁ autenticado e havendo
  // um rascunho para ESTE capítulo (casamento por pathname), restaura a seleção e,
  // se a ação era "anotar", reabre o compositor com o texto/refs. Roda uma vez
  // (rehydratedRef) e limpa o rascunho para não reabrir em navegações futuras.
  useEffect(() => {
    if (rehydratedRef.current || !isAuthenticated) return;
    const draft = loadSelectionDraft();
    if (!draft) return;
    if (draft.path.split('?')[0] !== `/compare/${book.osis_code}/${number}`) return;

    const valid = new Set(draft.verses.filter((v) => rows.some((r) => r.verse === v)));
    rehydratedRef.current = true;
    clearSelectionDraft();
    if (valid.size === 0) return;

    setSelectMode(true);
    setSelectedVerses(valid);
    if (draft.action === 'annotate') {
      setDraftNote(draft.note ?? '');
      setDraftRefs(draft.refs ?? []);
      setDraftAutoCompose(true);
    }
    const first = Math.min(...valid);
    window.setTimeout(
      () => document.getElementById(`v${first}`)?.scrollIntoView({ block: 'center' }),
      120,
    );
  }, [isAuthenticated, book.osis_code, number, rows]);

  const toggleVerse = (verse: number) => {
    setSelectedVerses((prev) => {
      const next = new Set(prev);
      if (next.has(verse)) next.delete(verse);
      else next.add(verse);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedVerses(new Set());
    setDraftNote(undefined);
    setDraftRefs(undefined);
    setDraftAutoCompose(false);
  };

  // Referências selecionadas, prontas para as server actions (ordenadas por versículo).
  const selectedReferences: ReferenceInput[] = rows
    .filter((r) => selectedVerses.has(r.verse))
    .map((r) => ({ ref: r.ref, osis: book.osis_code, bookName: book.name_pt, chapter: number, verse: r.verse }));

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Auto-hide: esconde ao rolar para baixo (leitura imersiva), reaparece ao
          subir. Forçado visível com seleção ativa ou popover de fonte aberto. */}
      <header
        className={`sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50/90 px-4 py-2.5 backdrop-blur transition-transform duration-300 dark:border-neutral-800 dark:bg-neutral-950/90 ${
          headerHidden && !selectMode && !fontMenuOpen ? '-translate-y-full' : ''
        }`}
      >
        {/* Linha 1 — navegação: voltar + navegador de capítulo centralizado (‹ título ›). */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Link href="/" className="justify-self-start text-sm text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300">
            ← Início
          </Link>

          <div className="flex items-center gap-0.5 justify-self-center">
            {prev != null ? (
              <Link
                href={compareHref(book.osis_code, prev, codes)}
                aria-label={`Capítulo anterior (${prev})`}
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ‹
              </Link>
            ) : (
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center text-lg text-neutral-300 dark:text-neutral-700">
                ‹
              </span>
            )}

            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Selecionar livro, capítulo e versículo"
            >
              {book.name_pt} {number}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-neutral-400" aria-hidden="true">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {next != null ? (
              <Link
                href={compareHref(book.osis_code, next, codes)}
                aria-label={`Próximo capítulo (${next})`}
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ›
              </Link>
            ) : (
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center text-lg text-neutral-300 dark:text-neutral-700">
                ›
              </span>
            )}
          </div>

          <span aria-hidden /> {/* coluna vazia: equilibra o "← Início" para centralizar o navegador */}
        </div>

        {/* Linha 2 — ações da leitura. */}
        <div className="mt-1.5 flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setStudyOpen(true)}
            className="rounded-md px-2 py-1 font-medium text-amber-700 transition hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30"
            aria-label="Estudo com IA"
          >
            <span aria-hidden>✨</span> Estudo
          </button>
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className={`rounded-md px-2 py-1 transition ${
              selectMode
                ? 'bg-amber-100 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
            }`}
            aria-pressed={selectMode}
            aria-label="Selecionar versículos"
          >
            {selectMode ? 'Cancelar' : 'Selecionar'}
          </button>
          <button
            type="button"
            onClick={() => setVersionsOpen(true)}
            className="rounded-md px-2 py-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Escolher versões"
          >
            Versões ({translations.length})
          </button>
          <div className="relative ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => (listening ? stopListening() : startListening())}
              aria-label={listening ? 'Parar leitura em voz alta' : 'Ouvir o capítulo'}
              aria-pressed={listening}
              className={`rounded-md px-2 py-1 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                listening ? 'text-amber-700 dark:text-amber-400' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
            >
              <span aria-hidden>🔊</span>
            </button>
            <button
              type="button"
              onClick={() => setFontMenuOpen((o) => !o)}
              aria-label="Tamanho da fonte"
              aria-expanded={fontMenuOpen}
              className="rounded-md px-2 py-1 font-serif text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              Aa
            </button>
            <ReaderHelp />

            {/* Popover de tamanho de fonte: opções com pré-visualização do tamanho.
                O backdrop de fechamento vai por PORTAL ao body — dentro do header
                (backdrop-blur) um fixed ficaria confinado à caixa do header. */}
            {fontMenuOpen && (
              <>
                {typeof document !== 'undefined' &&
                  createPortal(
                    <button
                      type="button"
                      aria-label="Fechar"
                      onClick={() => setFontMenuOpen(false)}
                      className="fixed inset-0 z-20 cursor-default"
                    />,
                    document.body,
                  )}
                <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
                  {FONT_SIZES.map((s, i) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => pickFontSize(s.value)}
                      aria-pressed={fontSize === s.value}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition ${
                        fontSize === s.value
                          ? 'bg-amber-50 font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                          : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <span style={{ fontSize: 12 + i * 2 }}>{s.label}</span>
                      {fontSize === s.value && <span aria-hidden>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main data-fontsize={fontSize} className={`px-4 py-5 ${selectMode ? 'pb-24' : ''}`}>
        {/* Cabeçalho de colunas (só desktop): nomes das versões alinhados às colunas. */}
        <div className="mb-2 hidden sm:grid sm:gap-4" style={gridStyle}>
          {translations.map((t) => (
            <div key={t.code} className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t.name}
            </div>
          ))}
        </div>

        <div className="flex flex-col">
          {rows.map((row) => {
            const activePosition = selected?.verse === row.verse ? selected.token.position : null;
            const activeHebrewPosition =
              selectedHebrew?.verse === row.verse ? selectedHebrew.word.position : null;
            const isSelected = selectedVerses.has(row.verse);
            const verseAnnotations = annotationsByVerse.get(row.verse);
            const tint = highlights[row.verse];
            return (
              <div
                key={row.verse}
                id={`v${row.verse}`}
                className={`relative scroll-mt-20 rounded-md border-b border-neutral-100 py-3 transition-colors duration-500 last:border-0 dark:border-neutral-800/60 ${
                  selectMode ? 'flex gap-3' : ''
                } ${highlight === row.verse || speakingVerse === row.verse ? 'bg-amber-50 dark:bg-amber-900/20' : ''} ${
                  isSelected ? 'bg-amber-50/70 dark:bg-amber-900/10' : ''
                } ${tint && highlight !== row.verse && speakingVerse !== row.verse && !isSelected ? HIGHLIGHT_TINT[tint] : ''}`}
              >
                {verseAnnotations && verseAnnotations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAnnotationVerse(row.verse)}
                    title={`Ver anotação${verseAnnotations.length > 1 ? 's' : ''} do versículo ${row.verse}`}
                    aria-label={`Ver anotação${verseAnnotations.length > 1 ? 's' : ''} do versículo ${row.verse}`}
                    className="absolute right-1 top-2 z-10 rounded-md px-1 text-sm leading-none transition hover:scale-110"
                  >
                    <span aria-hidden>📝</span>
                    {verseAnnotations.length > 1 && (
                      <span className="ml-0.5 align-super text-[10px] font-semibold text-amber-700">
                        {verseAnnotations.length}
                      </span>
                    )}
                  </button>
                )}
                {selectMode && row.verse > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleVerse(row.verse)}
                    aria-pressed={isSelected}
                    aria-label={`Selecionar versículo ${row.verse}`}
                    className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs transition ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500 text-amber-950'
                        : 'border-neutral-300 text-transparent hover:border-amber-400 dark:border-neutral-600'
                    }`}
                  >
                    ✓
                  </button>
                )}
                <div className="min-w-0 flex-1 sm:grid sm:gap-4" style={gridStyle}>
                {translations.map((t) => {
                  const isOriginal = t.code === originalCode;
                  const text = row.texts[t.code] ?? null;
                  // Coluna original: interlinear clicável — tokens gregos (NT) ou
                  // palavras hebraicas (AT). Cai para o texto plano se faltarem
                  // dados naquele versículo.
                  const originalTokens = isOriginal ? row.tokens : null;
                  const showTokens = originalTokens != null && originalTokens.length > 0;
                  const originalHebrew = isOriginal ? row.hebrewWords : null;
                  const showHebrew = originalHebrew != null && originalHebrew.length > 0;
                  return (
                    <div key={t.code} className="mb-2 last:mb-0 sm:mb-0">
                      {/* Rótulo da versão por bloco (só mobile, pois empilha). */}
                      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 sm:hidden">
                        {t.name}
                      </span>
                      <p className="verse-text flex items-start gap-1.5 text-[15px] leading-relaxed">
                        {row.verse === 0 ? (
                          <span className="mt-0.5 select-none text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                            tít.
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCrossRefVerse(row.verse)}
                            aria-label={`Referências cruzadas do versículo ${row.verse}`}
                            className="mt-0.5 cursor-pointer select-none text-xs font-semibold text-neutral-500 underline decoration-neutral-300 decoration-dotted underline-offset-2 transition hover:text-amber-700 dark:text-neutral-400 dark:decoration-neutral-600 dark:hover:text-amber-400"
                          >
                            {row.verse}
                          </button>
                        )}
                        {showTokens ? (
                          <GreekVerse
                            tokens={originalTokens}
                            activePosition={activePosition}
                            onSelect={(token) => setSelected({ verse: row.verse, token })}
                          />
                        ) : showHebrew ? (
                          <HebrewVerse
                            words={originalHebrew}
                            activePosition={activeHebrewPosition}
                            onSelect={(word) => setSelectedHebrew({ verse: row.verse, word })}
                          />
                        ) : text ? (
                          <span
                            dir={isOriginal && originalIsHebrew ? 'rtl' : undefined}
                            className={
                              isOriginal
                                ? originalIsHebrew
                                  ? 'font-hebrew text-[17px] leading-loose'
                                  : 'font-greek'
                                : ''
                            }
                          >
                            {text}
                          </span>
                        ) : (
                          <span className="text-neutral-300 dark:text-neutral-600">—</span>
                        )}
                      </p>
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })}
        </div>

        <Attributions translations={translations} />
      </main>

      {/* Controle da leitura em voz alta: pausa/retoma e parar. */}
      {listening && (
        <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] left-4 z-30 flex items-center gap-1 rounded-full border border-neutral-200 bg-white/95 px-2 py-1 shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
          <span className="px-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            🔊 {speakingVerse != null ? `v. ${speakingVerse}` : '…'}
          </span>
          <button
            type="button"
            onClick={toggleListenPause}
            aria-label={listenPaused ? 'Retomar leitura' : 'Pausar leitura'}
            className="flex size-8 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <span aria-hidden>{listenPaused ? '▶' : '⏸'}</span>
          </button>
          <button
            type="button"
            onClick={stopListening}
            aria-label="Parar leitura"
            className="flex size-8 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
      )}

      {/* Chip flutuante de posição: mostra o versículo atual em capítulos longos e
          abre o seletor (já posicionado no capítulo, com a grade de versículos). */}
      {scrolledFar && currentVerse != null && !selectMode && (
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label={`Você está no versículo ${currentVerse} — pular para outro versículo`}
          className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] right-4 z-30 rounded-full border border-neutral-200 bg-white/95 px-3.5 py-2 text-sm font-semibold text-neutral-700 shadow-lg backdrop-blur transition hover:border-amber-300 hover:text-amber-700 dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-200 dark:hover:border-amber-700 dark:hover:text-amber-400"
        >
          v. {currentVerse}
        </button>
      )}

      {navOpen && (
        <NavSheet
          books={books}
          current={book}
          chapter={number}
          chapters={chapters}
          rows={rows}
          codes={codes}
          onClose={() => setNavOpen(false)}
          onVerse={goToVerse}
        />
      )}

      {versionsOpen && (
        <VersionSheet
          all={allTranslations}
          selected={codes}
          osis={book.osis_code}
          chapter={number}
          onClose={() => setVersionsOpen(false)}
        />
      )}

      {studyOpen && (
        <StudyModal
          osis={book.osis_code}
          chapter={number}
          codes={codes}
          bookName={book.name_pt}
          onClose={() => setStudyOpen(false)}
        />
      )}

      {selected && (
        <TokenSheet
          token={selected.token}
          lemma={selected.token.lemmaKey ? greekLexicon[selected.token.lemmaKey] ?? null : null}
          onClose={() => setSelected(null)}
        />
      )}

      {selectedHebrew && (
        <HebrewWordSheet word={selectedHebrew.word} lexicon={hebrewLexicon} onClose={() => setSelectedHebrew(null)} />
      )}

      {annotationVerse != null && (
        <AnnotationSheet
          verse={annotationVerse}
          annotations={annotationsByVerse.get(annotationVerse) ?? []}
          onClose={() => setAnnotationVerse(null)}
        />
      )}

      {crossRefVerse != null && (
        <CrossRefsSheet
          // key por identidade do versículo: trocar de versículo com o sheet aberto
          // REMONTA o componente — sem isso, openIdx/previews do versículo anterior
          // vazariam para a lista nova (preview errado sob a referência errada).
          key={`${book.osis_code}-${number}-${crossRefVerse}`}
          osis={book.osis_code}
          bookName={book.name_pt}
          chapter={number}
          verse={crossRefVerse}
          previewCode={translations.find((t) => !t.is_original)?.code ?? null}
          onClose={() => setCrossRefVerse(null)}
        />
      )}

      {selectMode && selectedReferences.length > 0 && (
        <VerseSelectionBar
          references={selectedReferences}
          bookName={book.name_pt}
          chapter={number}
          onClear={exitSelectMode}
          isAuthenticated={isAuthenticated}
          initialNote={draftNote}
          initialRefs={draftRefs}
          autoCompose={draftAutoCompose}
        />
      )}
    </div>
  );
}

// Atribuições das versões exibidas. Cada tradução credita nome e fonte.
function Attributions({ translations }: { translations: Translation[] }) {
  return (
    <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      {translations.map((t) => (
        <p key={t.code}>
          <span className="font-medium">{t.name}</span>
          {t.source_url && (
            <>
              {' · '}
              <a
                href={t.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                fonte
              </a>
            </>
          )}
        </p>
      ))}
    </footer>
  );
}
