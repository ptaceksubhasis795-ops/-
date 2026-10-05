import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const algorithm = 'aes-256-gcm';

function keyFromEnv() {
  return createHash('sha256').update(process.env.FIELD_ENCRYPTION_KEY || 'development-only-change-me').digest();
}

export function encryptField(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, keyFromEnv(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptField(payload: string) {
  const [ivText, tagText, encryptedText] = payload.split('.');
  const decipher = createDecipheriv(algorithm, keyFromEnv(), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]).toString('utf8');
}

export function maskSensitive(value: string, visiblePrefix = 3, visibleSuffix = 4) {
  if (!value) return '';
  if (value.length <= visiblePrefix + visibleSuffix) return '*'.repeat(value.length);
  return `${value.slice(0, visiblePrefix)}${'*'.repeat(Math.max(4, value.length - visiblePrefix - visibleSuffix))}${value.slice(-visibleSuffix)}`;
}
