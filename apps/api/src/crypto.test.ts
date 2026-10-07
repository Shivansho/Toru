import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, hashEmail } from './crypto';

describe('crypto helpers', () => {
  const dummyKey = '12345678901234567890123456789012'; // 32 bytes
  const pepper = 'some-secret-pepper';

  describe('AES-256-GCM encryption', () => {
    it('round-trips correctly', () => {
      const plaintext = 'secret message';
      const encrypted = encrypt(plaintext, dummyKey);
      
      expect(encrypted).not.toBe(plaintext);
      
      const decrypted = decrypt(encrypted, dummyKey);
      expect(decrypted).toBe(plaintext);
    });

    it('fails to decrypt tampered ciphertext', () => {
      const plaintext = 'secret message';
      const encrypted = encrypt(plaintext, dummyKey);
      
      // Tamper with ciphertext
      const parts = encrypted.split(':');
      parts[2] = 'ffffffffffffffffffffffffffffffff';
      const tampered = parts.join(':');
      
      expect(() => decrypt(tampered, dummyKey)).toThrow();
    });
    
    it('fails to decrypt with tampered auth tag', () => {
      const plaintext = 'secret message';
      const encrypted = encrypt(plaintext, dummyKey);
      
      const parts = encrypted.split(':');
      parts[1] = '00000000000000000000000000000000';
      const tampered = parts.join(':');
      
      expect(() => decrypt(tampered, dummyKey)).toThrow();
    });
  });

  describe('Email hashing', () => {
    it('hashes consistently', () => {
      const email = 'user@example.com';
      const hash1 = hashEmail(email, pepper);
      const hash2 = hashEmail(email, pepper);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('normalizes email before hashing', () => {
      const hash1 = hashEmail('user@example.com', pepper);
      const hash2 = hashEmail(' User@Example.COM ', pepper);
      
      expect(hash1).toBe(hash2);
    });
  });
});
