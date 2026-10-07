import crypto from 'crypto';

/**
 * Encrypts a string using AES-256-GCM.
 * Requires DATA_ENCRYPTION_KEY (32 bytes / 64 hex chars or 32 char string).
 */
export function encrypt(text: string, keyString: string): string {
  if (!text) return text;
  
  const key = Buffer.from(keyString, 'utf-8');
  if (key.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes long');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string using AES-256-GCM.
 */
export function decrypt(encryptedData: string, keyString: string): string {
  if (!encryptedData) return encryptedData;
  
  const key = Buffer.from(keyString, 'utf-8');
  if (key.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes long');
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Hashes a string (like an email) using HMAC-SHA256 and a pepper.
 */
export function hashEmail(email: string, pepper: string): string {
  if (!email) return email;
  return crypto.createHmac('sha256', pepper).update(email.trim().toLowerCase()).digest('hex');
}
