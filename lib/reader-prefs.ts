/**
 * Preferências de leitura do CLIENTE (localStorage) — módulo de dados puros,
 * importável tanto pelo leitor quanto pela tela de Configurações.
 *
 * O tamanho de fonte é aplicado via atributo data-fontsize no container do
 * leitor + regras em globals.css (ver "Tamanho de fonte do leitor").
 */

export const FONT_SIZE_KEY = 'koine:reader:fontsize';

export type ReaderFontSize = 'sm' | 'md' | 'lg' | 'xl';

export const FONT_SIZES: { value: ReaderFontSize; label: string }[] = [
  { value: 'sm', label: 'Pequena' },
  { value: 'md', label: 'Normal' },
  { value: 'lg', label: 'Grande' },
  { value: 'xl', label: 'Extra' },
];

export const DEFAULT_FONT_SIZE: ReaderFontSize = 'md';

export function isReaderFontSize(value: unknown): value is ReaderFontSize {
  return value === 'sm' || value === 'md' || value === 'lg' || value === 'xl';
}

/** Lê a preferência salva (default 'md'; tolerante a localStorage indisponível). */
export function loadFontSize(): ReaderFontSize {
  try {
    const raw = window.localStorage.getItem(FONT_SIZE_KEY);
    return isReaderFontSize(raw) ? raw : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

/** Persiste a preferência (silencioso se localStorage indisponível). */
export function saveFontSize(size: ReaderFontSize): void {
  try {
    window.localStorage.setItem(FONT_SIZE_KEY, size);
  } catch {
    /* modo privado — apenas não persiste */
  }
}
