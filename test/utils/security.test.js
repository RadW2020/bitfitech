/**
 * @fileoverview Unit tests for Security utilities
 * @author Raul JM
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityValidator } from '../../src/utils/security.js';
import { SecurityError } from '../../src/utils/errors.js';

describe('SecurityValidator', () => {
  describe('validateOrder', () => {
    it('should validate valid order data', () => {
      const orderData = {
        userId: 'user123',
        side: 'buy',
        amount: '100',
        price: '50000',
        pair: 'BTC/USD',
      };

      const result = SecurityValidator.validateOrder(orderData);
      expect(result).toEqual(orderData);
    });

    it('should sanitize order data', () => {
      const orderData = {
        userId: '  user123  ',
        side: 'buy',
        amount: '100',
        price: '50000',
        pair: 'BTC/USD',
      };

      const result = SecurityValidator.validateOrder(orderData);
      expect(result.userId).toBe('user123');
    });

    it('should reject invalid userId', () => {
      const orderData = {
        userId: 'user@123',
        side: 'buy',
        amount: '100',
        price: '50000',
      };

      expect(() => SecurityValidator.validateOrder(orderData)).toThrow(SecurityError);
    });

    it('should reject invalid side', () => {
      const orderData = {
        userId: 'user123',
        side: 'invalid',
        amount: '100',
        price: '50000',
      };

      expect(() => SecurityValidator.validateOrder(orderData)).toThrow(SecurityError);
    });

    it('should reject invalid amount', () => {
      const orderData = {
        userId: 'user123',
        side: 'buy',
        amount: 'invalid',
        price: '50000',
      };

      expect(() => SecurityValidator.validateOrder(orderData)).toThrow(SecurityError);
    });

    it('should reject amount out of range', () => {
      const orderData = {
        userId: 'user123',
        side: 'buy',
        amount: '2000000',
        price: '50000',
      };

      expect(() => SecurityValidator.validateOrder(orderData)).toThrow(SecurityError);
    });
  });

  describe('sanitizeString', () => {
    it('should sanitize valid string', () => {
      const result = SecurityValidator.sanitizeString('hello world', 1, 100);
      expect(result).toBe('hello world');
    });

    it('should remove control characters', () => {
      const result = SecurityValidator.sanitizeString('hello\x00world', 1, 100);
      expect(result).toBe('helloworld');
    });

    it('should trim whitespace', () => {
      const result = SecurityValidator.sanitizeString('  hello  ', 1, 100);
      expect(result).toBe('hello');
    });

    it('should limit length', () => {
      const result = SecurityValidator.sanitizeString('hello world', 1, 5);
      expect(result).toBe('hello');
    });

    it('should reject string too short', () => {
      expect(() => SecurityValidator.sanitizeString('hi', 5, 100)).toThrow(SecurityError);
    });
  });

  describe('sanitizeNumber', () => {
    it('should sanitize valid number', () => {
      const result = SecurityValidator.sanitizeNumber('123.45');
      expect(result).toBe(123.45);
    });

    it('should remove non-numeric characters', () => {
      const result = SecurityValidator.sanitizeNumber('abc123.45def');
      expect(result).toBe(123.45);
    });

    it('should reject invalid number', () => {
      expect(() => SecurityValidator.sanitizeNumber('abc')).toThrow(SecurityError);
    });
  });

  describe('validateMessageSize', () => {
    it('should allow small message', () => {
      const message = { data: 'small' };
      expect(() => SecurityValidator.validateMessageSize(message, 1000)).not.toThrow();
    });

    it('should reject large message', () => {
      const message = { data: 'x'.repeat(2000) };
      expect(() => SecurityValidator.validateMessageSize(message, 1000)).toThrow(SecurityError);
    });
  });

  describe('sanitizeForLogging', () => {
    it('should redact sensitive fields', () => {
      const data = {
        userId: 'user123',
        password: 'secret123',
        token: 'abc123',
        amount: '100',
      };

      const result = SecurityValidator.sanitizeForLogging(data);
      expect(result.password).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.userId).toBe('user123');
    });

    it('should truncate long strings', () => {
      const data = {
        message: 'x'.repeat(1000),
      };

      const result = SecurityValidator.sanitizeForLogging(data);
      expect(result.message).toHaveLength(503); // 500 + '...'
      expect(result.message.endsWith('...')).toBe(true);
    });
  });
});
