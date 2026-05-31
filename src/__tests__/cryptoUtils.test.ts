import { describe, it, expect } from 'vitest';
import { isEncryptedValue, hasEncryptedValues, inspectAesKey } from '../cryptoUtils';

describe('cryptoUtils', () => {
  describe('isEncryptedValue', () => {
    it('should identify valid encrypted values', () => {
      expect(isEncryptedValue('![abc1234=]')).toBe(true);
      expect(isEncryptedValue('  ![xyz]  ')).toBe(true);
    });

    it('should reject unencrypted values', () => {
      expect(isEncryptedValue('plainText')).toBe(false);
      expect(isEncryptedValue('!plainText')).toBe(false);
      expect(isEncryptedValue('![plainText')).toBe(false);
      expect(isEncryptedValue('plainText]')).toBe(false);
    });
  });

  describe('hasEncryptedValues', () => {
    it('should detect when encrypted values are present in YAML string', () => {
      const yaml = `
        db:
          password: ![encryptedPassword123]
          user: sa
      `;
      expect(hasEncryptedValues(yaml)).toBe(true);
    });

    it('should return false if no encrypted values are present', () => {
      const yaml = `
        db:
          password: unencryptedPassword
          user: sa
      `;
      expect(hasEncryptedValues(yaml)).toBe(false);
    });
  });

  describe('inspectAesKey', () => {
    it('should inspect and classify standard key sizes', () => {
      // 128-bit key (16 bytes)
      const key128 = '1234567890123456';
      expect(inspectAesKey(key128)).toEqual({
        bytes: 16,
        aesValid: true,
        aesVariant: 'AES-128',
      });

      // 192-bit key (24 bytes)
      const key192 = '123456789012345678901234';
      expect(inspectAesKey(key192)).toEqual({
        bytes: 24,
        aesValid: true,
        aesVariant: 'AES-192',
      });

      // 256-bit key (32 bytes)
      const key256 = '12345678901234567890123456789012';
      expect(inspectAesKey(key256)).toEqual({
        bytes: 32,
        aesValid: true,
        aesVariant: 'AES-256',
      });
    });

    it('should flag invalid key sizes', () => {
      const invalidKey = 'short';
      expect(inspectAesKey(invalidKey)).toEqual({
        bytes: 5,
        aesValid: false,
        aesVariant: null,
      });
    });
  });
});
