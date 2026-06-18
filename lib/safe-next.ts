/**
 * Sanitiza o parametro `next` de redirecionamento pos-login.
 *
 * So aceita caminho INTERNO (comeca com '/' e nao com '//' nem '/\') para evitar
 * open redirect: um `next=https://malicioso` ou `next=//malicioso` levaria o
 * usuario autenticado para fora do app. Retorna null quando invalido — o chamador
 * decide o fallback (normalmente '/').
 */
export function safeNextPath(next: string | string[] | undefined | null): string | null {
  if (typeof next !== 'string') return null;
  let value = next.trim();
  if (!value) return null;
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!value.startsWith('/')) return null;
  // Bloqueia '//host' e '/\host' (protocol-relative / escape de path).
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}
