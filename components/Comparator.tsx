'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Book, Token } from '@/lib/corpus';
import type { HebrewWord } from '@/lib/hebrew';
import type { ChapterView, ChapterViewRow } from '@/lib/chapter-view';
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
import type { ReferenceInput } from '@/app/study/actions';
import type { Annotation } from '@/lib/annotations';
import { getBookChapters, getChapterVerses } from '@/app/compare/actions';

const TESTAMENT_LABELS: Record<string, string> = {
  NT: 'Novo Testamento',
  OT: 'Antigo Testamento',
};

// Fecha um sheet/modal ao pressionar Escape. `aria-modal` promete que o fundo é
// inerte; o Escape entrega a saída por teclado esperada de um diálogo.
function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
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
  useEscapeToClose(onClose);

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
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />

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
      </div>
    </div>
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
  useEscapeToClose(onClose);
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
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
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
      </div>
    </div>
  );
}

export function Comparator({
  chapter,
  books,
  allTranslations,
  annotations,
}: {
  chapter: ChapterView;
  books: Book[];
  allTranslations: Translation[];
  annotations: Annotation[];
}) {
  const { book, number, chapters, translations, rows } = chapter;
  const [navOpen, setNavOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  // Modo de seleção de versículos (para citar/explicar). Quando ativo, cada linha
  // ganha uma caixa de seleção; a barra de ação aparece com 1+ selecionados.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  // Token grego selecionado (abre o TokenSheet com os dados linguísticos).
  const [selected, setSelected] = useState<{ verse: number; token: Token } | null>(null);
  // Palavra hebraica selecionada (abre o HebrewWordSheet, breakdown por morfema).
  const [selectedHebrew, setSelectedHebrew] = useState<{ verse: number; word: HebrewWord } | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const highlightTimer = useRef<number | null>(null);
  // Versículo cujas anotações estão abertas na folha de leitura (marcador 📝).
  const [annotationVerse, setAnnotationVerse] = useState<number | null>(null);
  // Versículo cujas referências cruzadas (TSK) estão abertas (toque no número).
  const [crossRefVerse, setCrossRefVerse] = useState<number | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

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

  // Memória do "último lido": ao abrir /compare sem rota, o redirector usa isto
  // para retomar o livro/capítulo onde o usuário parou (em vez de João 1 fixo).
  useEffect(() => {
    try {
      window.localStorage.setItem(
        'koine:compare:last',
        JSON.stringify({ osis: book.osis_code, chapter: number }),
      );
    } catch {
      // localStorage indisponível (modo privado/SSR) — apenas não persiste.
    }
  }, [book.osis_code, number]);

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
        router.replace(compareHref(book.osis_code, number, saved));
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
    const raw = searchParams.get('goto');
    if (!raw) return;
    const verse = Number(raw);
    if (!Number.isInteger(verse) || lastGoto.current === verse) return;

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
  };

  // Referências selecionadas, prontas para as server actions (ordenadas por versículo).
  const selectedReferences: ReferenceInput[] = rows
    .filter((r) => selectedVerses.has(r.verse))
    .map((r) => ({ ref: r.ref, osis: book.osis_code, bookName: book.name_pt, chapter: number, verse: r.verse }));

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50/90 px-4 py-2.5 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
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
                className="flex size-9 items-center justify-center rounded-md text-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ‹
              </Link>
            ) : (
              <span aria-hidden className="flex size-9 items-center justify-center text-lg text-neutral-300 dark:text-neutral-700">
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
                className="flex size-9 items-center justify-center rounded-md text-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ›
              </Link>
            ) : (
              <span aria-hidden className="flex size-9 items-center justify-center text-lg text-neutral-300 dark:text-neutral-700">
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
          <div className="ml-auto">
            <ReaderHelp />
          </div>
        </div>
      </header>

      <main className={`px-4 py-5 ${selectMode ? 'pb-24' : ''}`}>
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
            return (
              <div
                key={row.verse}
                id={`v${row.verse}`}
                className={`relative scroll-mt-20 rounded-md border-b border-neutral-100 py-3 transition-colors duration-500 last:border-0 dark:border-neutral-800/60 ${
                  selectMode ? 'flex gap-3' : ''
                } ${highlight === row.verse ? 'bg-amber-50 dark:bg-amber-900/20' : ''} ${
                  isSelected ? 'bg-amber-50/70 dark:bg-amber-900/10' : ''
                }`}
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
                      <p className="flex items-start gap-1.5 text-[15px] leading-relaxed">
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

      {selected && <TokenSheet token={selected.token} onClose={() => setSelected(null)} />}

      {selectedHebrew && (
        <HebrewWordSheet word={selectedHebrew.word} onClose={() => setSelectedHebrew(null)} />
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
          osis={book.osis_code}
          bookName={book.name_pt}
          chapter={number}
          verse={crossRefVerse}
          onClose={() => setCrossRefVerse(null)}
        />
      )}

      {selectMode && selectedReferences.length > 0 && (
        <VerseSelectionBar
          references={selectedReferences}
          bookName={book.name_pt}
          chapter={number}
          onClear={exitSelectMode}
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
