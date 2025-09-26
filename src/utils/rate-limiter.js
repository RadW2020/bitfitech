/**
 * @fileoverview Rate limiting utility for security
 * @author Raul JM
 */

import { SecurityError, ErrorContext, ErrorSeverity } from './errors.js';

/**
 * Rate limiter with sliding window algorithm
 */
export class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
    this.requests = new Map(); // userId -> { timestamps: [], count: number }
  }

  /**
   * Check if request is allowed
   * @param {string} identifier - User ID or IP
   * @param {number} weight - Request weight (default: 1)
   * @returns {boolean} Whether request is allowed
   */
  isAllowed(identifier, weight = 1) {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || { timestamps: [], count: 0 };

    // Remove old timestamps outside the window
    userRequests.timestamps = userRequests.timestamps.filter(
      timestamp => now - timestamp < this.windowMs
    );

    // Check if adding this request would exceed the limit
    if (userRequests.timestamps.length + weight > this.maxRequests) {
      return false;
    }

    // Add current request
    for (let i = 0; i < weight; i++) {
      userRequests.timestamps.push(now);
    }
    userRequests.count = userRequests.timestamps.length;

    this.requests.set(identifier, userRequests);
    return true;
  }

  /**
   * Get current request count for identifier
   * @param {string} identifier - User ID or IP
   * @returns {number} Current request count
   */
  getCount(identifier) {
    const userRequests = this.requests.get(identifier);
    return userRequests ? userRequests.count : 0;
  }

  /**
   * Reset rate limit for identifier
   * @param {string} identifier - User ID or IP
   */
  reset(identifier) {
    this.requests.delete(identifier);
  }

  /**
   * Clean up old entries
   */
  cleanup() {
    const now = Date.now();
    for (const [identifier, userRequests] of this.requests.entries()) {
      userRequests.timestamps = userRequests.timestamps.filter(
        timestamp => now - timestamp < this.windowMs
      );

      if (userRequests.timestamps.length === 0) {
        this.requests.delete(identifier);
      } else {
        userRequests.count = userRequests.timestamps.length;
      }
    }
  }
}

/**
 * Multi-tier rate limiter
 */
export class MultiTierRateLimiter {
  constructor() {
    this.limiters = {
      orders: new RateLimiter({ windowMs: 60000, maxRequests: 100 }), // 100 orders/min
      requests: new RateLimiter({ windowMs: 1000, maxRequests: 10 }), // 10 requests/sec
      messages: new RateLimiter({ windowMs: 60000, maxRequests: 1000 }), // 1000 messages/min
    };
  }

  /**
   * Check if operation is allowed
   * @param {string} identifier - User ID or IP
   * @param {string} operation - Operation type (orders, requests, messages)
   * @param {number} weight - Request weight
   * @returns {boolean} Whether operation is allowed
   */
  isAllowed(identifier, operation, weight = 1) {
    const limiter = this.limiters[operation];
    if (!limiter) {
      throw new SecurityError(`Unknown operation: ${operation}`);
    }

    return limiter.isAllowed(identifier, weight);
  }

  /**
   * Get count for operation
   * @param {string} identifier - User ID or IP
   * @param {string} operation - Operation type
   * @returns {number} Current count
   */
  getCount(identifier, operation) {
    const limiter = this.limiters[operation];
    return limiter ? limiter.getCount(identifier) : 0;
  }

  /**
   * Reset all limits for identifier
   * @param {string} identifier - User ID or IP
   */
  reset(identifier) {
    Object.values(this.limiters).forEach(limiter => limiter.reset(identifier));
  }

  /**
   * Cleanup all limiters
   */
  cleanup() {
    Object.values(this.limiters).forEach(limiter => limiter.cleanup());
  }
}
