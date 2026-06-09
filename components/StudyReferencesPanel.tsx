'use client';

/**
 * Painel de VERSÍCULOS CITADOS: lista as referências do estudo (com remoção) e um
 * seletor livro → capítulo → versículos para citar passagens da base. A citação
 * injeta o texto original + léxico daqueles versículos no contexto do chat.
 *
 * A seleção de versículos é MÚLTIPLA (chips alternáveis), com um atalho de
 * intervalo (de–até) para marcar um trecho contíguo de uma vez — espelha o modo
 * de seleção do comparador, em vez de citar um por um. A gravação é em lote via
 * addReferencesToStudy (ignoreDuplicates pela unique (study_id, ref)).
 *
 * Mutações são server actions; após cada uma chamamos router.refresh() para o
 * server component recarregar e propagar as referências atualizadas via props.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addReferencesToStudy, removeStudyReferences, type ReferenceInput } from '@/app/study/actions';
import { getBookChapters, getChapterVerses } from '@/app/compare/actions';
import { verseRef } from '@/lib/refs';
import type { StudyReference } from '@/lib/saved-studies';

export interface BookOption {
  osis: string;
  name: string;
}

// Uma faixa contígua de versículos do mesmo livro+capítulo (ex.: 34–36). Os `ids`
// são todas as referências cobertas, para remover a faixa inteira de uma vez.
interface RefRange {
  osis: string;
  bookName: string;
  chapter: number;
  from: number;
  to: number;
  ids: number[];
}

// Colapsa referências por-versículo em FAIXAS contíguas, para a lista não explodir
// (ex.: Salmo 119 inteiro vira uma linha "Salmo 119:1–176" em vez de 176 linhas).
function groupReferences(refs: StudyReference[]): RefRange[] {
  const sorted = [...refs].sort(
    (a, b) => a.osis.localeCompare(b.osis) || a.chapter - b.chapter || a.verse - b.verse,
  );
  const ranges: RefRange[] = [];
  for (const r of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.osis === r.osis && last.chapter === r.chapter && r.verse <= last.to + 1) {
      // contíguo (ou duplicado por segurança): estende a faixa atual
      last.to = Math.max(last.to, r.verse);
      last.ids.push(r.id);
    } else {
      ranges.push({ osis: r.osis, bookName: r.bookName, chapter: r.chapter, from: r.verse, to: r.verse, ids: [r.id] });
    }
  }
  return ranges;
}

function rangeLabel(r: RefRange): string {
  return r.from === r.to ? `${r.bookName} ${r.chapter}:${r.from}` : `${r.bookName} ${r.chapter}:${r.from}–${r.to}`;
}

export function StudyReferencesPanel({
  studyId,
  references,
  books,
}: {
  studyId: number;
  references: StudyReference[];
  books: BookOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [osis, setOsis] = useState('');
  const [chapters, setChapters] = useState<number[]>([]);
  const [chapter, setChapter] = useState<number | null>(null);
  const [verses, setVerses] = useState<number[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [loadingVerses, setLoadingVerses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sequência das buscas de versículos: trocas rápidas de livro/capítulo geram
  // fetches concorrentes; só a resposta da última requisição pode aplicar estado
  // (evita que um capítulo anterior sobrescreva os versículos do atual).
  const verseReqId = useRef(0);

  // Zera capítulo, versículos, seleção e intervalo (tudo que depende do livro/
  // capítulo escolhido). Centralizado para os call-sites não divergirem.
  function clearVerseSelection() {
    setVerses([]);
    setSelected(new Set());
    setRangeFrom('');
    setRangeTo('');
    setError(null);
  }

  function resetPicker() {
    setOsis('');
    setChapters([]);
    setChapter(null);
    clearVerseSelection();
  }

  function pickBook(value: string) {
    setOsis(value);
    setChapter(null);
    setChapters([]);
    clearVerseSelection();
    if (!value) return;
    startTransition(async () => {
      try {
        setChapters(await getBookChapters(value));
      } catch {
        setError('Não foi possível carregar os capítulos.');
      }
    });
  }

  function pickChapter(value: string) {
    const n = Number(value);
    const valid = Number.isInteger(n) && n > 0 ? n : null;
    setChapter(valid);
    clearVerseSelection();
    if (valid == null) return;
    const reqId = ++verseReqId.current;
    setLoadingVerses(true);
    startTransition(async () => {
      try {
        const vs = await getChapterVerses(osis, valid);
        if (verseReqId.current !== reqId) return; // resposta obsoleta: ignora
        setVerses(vs);
      } catch {
        if (verseReqId.current === reqId) setError('Não foi possível carregar os versículos.');
      } finally {
        if (verseReqId.current === reqId) setLoadingVerses(false);
      }
    });
  }

  function toggleVerse(v: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  // Marca todos os versículos existentes no intervalo [de, até] (inclusive),
  // somando à seleção atual. Versículos fora da lista do capítulo são ignorados.
  function markRange() {
    const from = Number(rangeFrom);
    const to = Number(rangeTo);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
      setError('Informe um intervalo válido (de ≤ até).');
      return;
    }
    const inRange = verses.filter((v) => v >= from && v <= to);
    if (inRange.length === 0) {
      setError('Nenhum versículo do capítulo nesse intervalo.');
      return;
    }
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const v of inRange) next.add(v);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(verses));
  }

  // Cita um conjunto explícito de versículos do capítulo aberto. Centralizado para
  // que "Citar (seleção)" e "Capítulo inteiro" compartilhem a mesma gravação.
  function citeVerses(verseNums: number[]) {
    const book = books.find((b) => b.osis === osis);
    if (!book || chapter == null || verseNums.length === 0) {
      setError('Selecione ao menos um versículo.');
      return;
    }
    const refs: ReferenceInput[] = [...new Set(verseNums)]
      .sort((a, b) => a - b)
      .map((v) => ({
        // Formato canônico (= verse_texts.ref e citações do comparador), para o
        // unique (study_id, ref) deduplicar entre os dois pontos de entrada.
        ref: verseRef(book.osis, chapter, v),
        osis: book.osis,
        bookName: book.name,
        chapter,
        verse: v,
      }));
    setError(null);
    startTransition(async () => {
      const res = await addReferencesToStudy(studyId, refs);
      if (res.ok) {
        setOpen(false);
        resetPicker();
        router.refresh();
      } else setError(res.error ?? 'Falha ao citar versículos.');
    });
  }

  function citar() {
    citeVerses([...selected]);
  }

  // Remove uma FAIXA inteira de versículos (1 ou N linhas) de uma vez.
  function removeRange(ids: number[]) {
    startTransition(async () => {
      const res = await removeStudyReferences(ids);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Falha ao remover.');
    });
  }

  const selectClass =
    'w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800';

  // Faixas compactas: versículos contíguos viram uma só linha (ex.: "Salmo 119:1–176").
  const ranges = groupReferences(references);

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Versículos citados ({references.length})
      </h2>

      {ranges.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Nenhum versículo citado ainda.</p>
      ) : (
        <ul className="space-y-1">
          {ranges.map((r) => {
            const label = rangeLabel(r);
            const count = r.to - r.from + 1;
            return (
              <li
                key={`${r.osis}-${r.chapter}-${r.from}-${r.to}`}
                className="flex items-center gap-2 rounded-md bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800/60"
              >
                <span className="min-w-0 flex-1 truncate">
                  {label}
                  {count > 1 && <span className="ml-1 text-neutral-400">({count} vers.)</span>}
                </span>
                <button
                  type="button"
                  onClick={() => removeRange(r.ids)}
                  disabled={pending}
                  aria-label={`Remover ${label}`}
                  className="flex size-7 shrink-0 items-center justify-center rounded text-neutral-500 transition hover:text-red-600 disabled:opacity-50 dark:text-neutral-400"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          + Citar versículos
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          <select aria-label="Livro" value={osis} onChange={(e) => pickBook(e.target.value)} className={selectClass}>
            <option value="">Selecione o livro</option>
            {books.map((b) => (
              <option key={b.osis} value={b.osis}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Capítulo"
            value={chapter ?? ''}
            onChange={(e) => pickChapter(e.target.value)}
            disabled={chapters.length === 0}
            className={`${selectClass} disabled:opacity-50`}
          >
            <option value="">Capítulo</option>
            {chapters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {chapter != null && (
            <>
              {loadingVerses ? (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Carregando versículos…</p>
              ) : verses.length === 0 ? (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Nenhum versículo neste capítulo.</p>
              ) : (
                <>
                  {/* Caminho rápido: cita o capítulo inteiro num toque (ex.: Salmo 119
                      vira uma só faixa "1–176", sem marcar versículo por versículo). */}
                  <button
                    type="button"
                    onClick={() => citeVerses(verses)}
                    disabled={pending}
                    className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50"
                  >
                    {pending ? 'Citando…' : `Citar capítulo inteiro (${verses.length} vers.)`}
                  </button>

                  <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                    <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
                    ou selecione um trecho
                    <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
                  </div>

                  {/* Atalho de intervalo: marca um trecho contíguo de uma vez. */}
                  <div className="flex items-end gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      De
                      <input
                        type="number"
                        min={1}
                        value={rangeFrom}
                        onChange={(e) => setRangeFrom(e.target.value)}
                        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      Até
                      <input
                        type="number"
                        min={1}
                        value={rangeTo}
                        onChange={(e) => setRangeTo(e.target.value)}
                        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={markRange}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      Marcar
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span>{selected.size} selecionado{selected.size === 1 ? '' : 's'}</span>
                    <span className="flex gap-2">
                      <button type="button" onClick={selectAll} className="hover:text-neutral-600 dark:hover:text-neutral-300">
                        Todos
                      </button>
                      {selected.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelected(new Set())}
                          className="hover:text-neutral-600 dark:hover:text-neutral-300"
                        >
                          Limpar
                        </button>
                      )}
                    </span>
                  </div>

                  {/* Chips de versículos: toque para alternar a seleção. */}
                  <div className="flex flex-wrap gap-1">
                    {verses.map((v) => {
                      const on = selected.has(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => toggleVerse(v)}
                          aria-pressed={on}
                          aria-label={`Versículo ${v}`}
                          className={
                            on
                              ? 'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-amber-500 px-2 text-sm font-semibold text-amber-950'
                              : 'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-neutral-300 px-2 text-sm text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800'
                          }
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={citar}
              disabled={pending || selected.size === 0}
              className="min-h-[44px] rounded-md bg-amber-500 px-4 py-1 text-xs font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {pending ? 'Citando…' : `Citar${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                resetPicker();
              }}
              className="rounded-md px-3 py-1 text-xs text-neutral-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
