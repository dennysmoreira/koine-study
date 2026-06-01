/**
 * Criptografia simétrica para SEGREDOS por usuário (hoje: a chave da API do Gemini
 * no fluxo BYOK). Usa AES-256-GCM — cifra autenticada: além de confidencialidade,
 * o authTag detecta adulteração do ciphertext.
 *
 * A chave-mestra vem de APP_SECRET_KEY (32 bytes em base64). Ela NUNCA é gravada no
 * banco; só vive no ambiente do servidor. Assim, um vazamento do banco expõe apenas
 * ciphertext inútil sem a APP_SECRET_KEY.
 *
 * Formato persistido: "v1.<iv>.<tag>.<data>" (cada parte em base64). O prefixo de
 * versão permite trocar de esquema/chave no futuro sem ambiguidade.
 */
import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // tamanho recomendado de nonce para GCM
const VERSION = 'v1';

// Resolve a chave-mestra (32 bytes) a partir de APP_SECRET_KEY (base64). Lança com
// mensagem acionável se ausente/ inválida — quem chama (encrypt) trata o erro.
function masterKey(): Buffer {
  const raw = process.env.APP_SECRET_KEY?.trim();
  if (!raw) {
    throw new Error(
      'defina APP_SECRET_KEY no .env (32 bytes em base64; gere com: openssl rand -base64 32)',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('APP_SECRET_KEY inválida: precisa ser 32 bytes em base64 (openssl rand -base64 32).');
  }
  return key;
}

/** Cifra um texto em claro e devolve o envelope "v1.iv.tag.data" (base64). */
export function encryptSecret(plain: string): string {
  const key = masterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
}

/**
 * Decifra o envelope. Retorna null em qualquer falha (chave ausente/errada,
 * formato inválido, authTag adulterado) — o chamador degrada graciosamente
 * (sem a chave BYOK, cai para as chaves compartilhadas / Groq).
 */
export function decryptSecret(envelope: string | null | undefined): string | null {
  if (!envelope) return null;
  const [version, ivB64, tagB64, dataB64] = envelope.split('.');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const key = masterKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}
