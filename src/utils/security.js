/**
 * @fileoverview Security validation and sanitization utilities
 * @author Raul JM
 */

import { SecurityError, ErrorContext, ErrorSeverity } from './errors.js';

/**
 * Security validator for input validation and sanitization
 */
export class SecurityValidator {
  /**
   * Validate and sanitize order data
   * @param {Object} orderData - Order data to validate
   * @returns {Object} Sanitized order data
   */
  static validateOrder(orderData) {
    const errors = [];

    // Validate userId
    if (!orderData.userId || typeof orderData.userId !== 'string') {
      errors.push('Invalid userId: must be a non-empty string');
    } else {
      orderData.userId = this.sanitizeString(orderData.userId, 3, 50);
      if (!/^[a-zA-Z0-9._-]+$/.test(orderData.userId)) {
        errors.push('Invalid userId: contains invalid characters');
      }
    }

    // Validate side
    if (!['buy', 'sell'].includes(orderData.side)) {
      errors.push('Invalid side: must be "buy" or "sell"');
    }

    // Validate amount
    if (!orderData.amount || typeof orderData.amount !== 'string') {
      errors.push('Invalid amount: must be a string');
    } else {
      const amount = this.sanitizeNumber(orderData.amount);
      if (amount <= 0 || amount > 1000000) {
        errors.push('Invalid amount: must be between 0 and 1,000,000');
      }
      orderData.amount = amount.toString();
    }

    // Validate price
    if (!orderData.price || typeof orderData.price !== 'string') {
      errors.push('Invalid price: must be a string');
    } else {
      const price = this.sanitizeNumber(orderData.price);
      if (price <= 0 || price > 1000000) {
        errors.push('Invalid price: must be between 0 and 1,000,000');
      }
      orderData.price = price.toString();
    }

    // Validate pair
    if (orderData.pair) {
      orderData.pair = this.sanitizeString(orderData.pair, 3, 20);
      if (!/^[A-Z]{3,4}\/[A-Z]{3,4}$/.test(orderData.pair)) {
        errors.push('Invalid pair: must be in format "BTC/USD"');
      }
    }

    if (errors.length > 0) {
      throw new SecurityError('Order validation failed', {
        context: new ErrorContext().withOrder(orderData).build(),
        severity: ErrorSeverity.ERROR,
        retryable: false,
        details: { errors },
      });
    }

    return orderData;
  }

  /**
   * Sanitize string input
   * @param {string} input - Input string
   * @param {number} minLength - Minimum length
   * @param {number} maxLength - Maximum length
   * @returns {string} Sanitized string
   */
  static sanitizeString(input, minLength = 1, maxLength = 1000) {
    if (typeof input !== 'string') {
      throw new SecurityError('Input must be a string');
    }

    // Remove control characters and trim
    let sanitized = input.replace(/[\p{Cc}]/gu, '').trim();

    // Limit length
    if (sanitized.length < minLength) {
      throw new SecurityError(`String too short: minimum ${minLength} characters`);
    }
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  }

  /**
   * Sanitize number input
   * @param {string} input - Input string
   * @returns {number} Sanitized number
   */
  static sanitizeNumber(input) {
    if (typeof input !== 'string') {
      throw new SecurityError('Input must be a string');
    }

    // Remove non-numeric characters except decimal point and minus
    const sanitized = input.replace(/[^0-9.-]/g, '');

    const num = parseFloat(sanitized);
    if (isNaN(num) || !isFinite(num)) {
      throw new SecurityError('Invalid number format');
    }

    return num;
  }

  /**
   * Validate message size
   * @param {Object} message - Message to validate
   * @param {number} maxSize - Maximum size in bytes
   */
  static validateMessageSize(message, maxSize = 1024 * 1024) {
    const size = JSON.stringify(message).length;
    if (size > maxSize) {
      throw new SecurityError(`Message too large: ${size} bytes (max: ${maxSize})`);
    }
  }

  /**
   * Sanitize log data
   * @param {Object} data - Data to sanitize for logging
   * @returns {Object} Sanitized data
   */
  static sanitizeForLogging(data) {
    const sanitized = { ...data };

    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'key', 'secret'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    // Truncate long strings
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].substring(0, 500) + '...';
      }
    });

    return sanitized;
  }
}
