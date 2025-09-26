/**
 * @fileoverview Unit tests for Rate Limiter
 * @author Raul JM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter, MultiTierRateLimiter } from '../../src/utils/rate-limiter.js';

describe('RateLimiter', () => {
  let rateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      windowMs: 1000, // 1 second for testing
      maxRequests: 3,
    });
  });

  describe('isAllowed', () => {
    it('should allow requests within limit', () => {
      expect(rateLimiter.isAllowed('user1')).toBe(true);
      expect(rateLimiter.isAllowed('user1')).toBe(true);
      expect(rateLimiter.isAllowed('user1')).toBe(true);
    });

    it('should reject requests over limit', () => {
      rateLimiter.isAllowed('user1');
      rateLimiter.isAllowed('user1');
      rateLimiter.isAllowed('user1');

      expect(rateLimiter.isAllowed('user1')).toBe(false);
    });

    it('should track different users separately', () => {
      rateLimiter.isAllowed('user1');
      rateLimiter.isAllowed('user1');
      rateLimiter.isAllowed('user1');

      expect(rateLimiter.isAllowed('user1')).toBe(false);
      expect(rateLimiter.isAllowed('user2')).toBe(true);
    });

    it('should handle weighted requests', () => {
      expect(rateLimiter.isAllowed('user1', 2)).toBe(true);
      expect(rateLimiter.isAllowed('user1', 1)).toBe(true);
      expect(rateLimiter.isAllowed('user1', 1)).toBe(false);
    });
  });

  describe('getCount', () => {
    it('should return current count', () => {
      expect(rateLimiter.getCount('user1')).toBe(0);

      rateLimiter.isAllowed('user1');
      expect(rateLimiter.getCount('user1')).toBe(1);

      rateLimiter.isAllowed('user1');
      expect(rateLimiter.getCount('user1')).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset user count', () => {
      rateLimiter.isAllowed('user1');
      rateLimiter.isAllowed('user1');
      expect(rateLimiter.getCount('user1')).toBe(2);

      rateLimiter.reset('user1');
      expect(rateLimiter.getCount('user1')).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove old entries', () => {
      rateLimiter.isAllowed('user1');

      // Mock time to simulate window passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(2000);

      rateLimiter.cleanup();
      expect(rateLimiter.getCount('user1')).toBe(0);

      vi.useRealTimers();
    });
  });
});

describe('MultiTierRateLimiter', () => {
  let multiLimiter;

  beforeEach(() => {
    multiLimiter = new MultiTierRateLimiter();
  });

  describe('isAllowed', () => {
    it('should check different operation types', () => {
      expect(multiLimiter.isAllowed('user1', 'orders')).toBe(true);
      expect(multiLimiter.isAllowed('user1', 'requests')).toBe(true);
      expect(multiLimiter.isAllowed('user1', 'messages')).toBe(true);
    });

    it('should track operations separately', () => {
      // Fill up orders limit
      for (let i = 0; i < 100; i++) {
        multiLimiter.isAllowed('user1', 'orders');
      }

      expect(multiLimiter.isAllowed('user1', 'orders')).toBe(false);
      expect(multiLimiter.isAllowed('user1', 'requests')).toBe(true);
    });
  });

  describe('getCount', () => {
    it('should return count for specific operation', () => {
      multiLimiter.isAllowed('user1', 'orders');
      multiLimiter.isAllowed('user1', 'orders');

      expect(multiLimiter.getCount('user1', 'orders')).toBe(2);
      expect(multiLimiter.getCount('user1', 'requests')).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all operations for user', () => {
      multiLimiter.isAllowed('user1', 'orders');
      multiLimiter.isAllowed('user1', 'requests');

      multiLimiter.reset('user1');

      expect(multiLimiter.getCount('user1', 'orders')).toBe(0);
      expect(multiLimiter.getCount('user1', 'requests')).toBe(0);
    });
  });
});
