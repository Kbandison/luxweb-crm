import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';

// AES-256-GCM. 32-byte key, 12-byte iv, 16-byte tag — all base64 in the DB.

function key(): Buffer {
  const raw = process.env.CREDS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('CREDS_ENCRYPTION_KEY is not set');
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      'CREDS_ENCRYPTION_KEY must decode to 32 bytes (base64 of `openssl rand -base64 32`)',
    );
  }
  return buf;
}

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv) as CipherGCM;
  const enc = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptSecret(s: EncryptedSecret): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(s.iv, 'base64'),
  ) as DecipherGCM;
  decipher.setAuthTag(Buffer.from(s.tag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(s.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
