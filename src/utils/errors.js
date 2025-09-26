/**
 * @fileoverview Enterprise Error Handling System
 * Comprehensive error management for financial trading systems
 *
 * Features:
 * - Custom error classes with context
 * - Error recovery strategies
 * - Error correlation and tracing
 * - Structured error reporting
 *
 * @author Raul JM
 */

/**
 * Base error class for all trading system errors
 * Provides structured error information with context
 */
export class TradingSystemError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.context = options.context || {};
    this.severity = options.severity || 'error';
    this.retryable = options.retryable || false;
    this.correlationId = options.correlationId || this.generateCorrelationId();
    this.stack = this.stack || new Error().stack;
  }

  /**
   * Generate correlation ID for error tracking
   * @returns {string} Correlation ID
   */
  generateCorrelationId() {
    return `err_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Convert error to structured format for logging
   * @returns {Object} Structured error information
   */
  toStructured() {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      severity: this.severity,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack,
    };
  }

  /**
   * Check if error is retryable
   * @returns {boolean} Is retryable
   */
  isRetryable() {
    return this.retryable;
  }

  /**
   * Get error severity
   * @returns {string} Error severity
   */
  getSeverity() {
    return this.severity;
  }
}

/**
 * Order-related errors
 */
export class OrderError extends TradingSystemError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      severity: options.severity || 'error',
      retryable: options.retryable || false,
    });
    this.orderId = options.orderId;
    this.userId = options.userId;
    this.side = options.side;
    this.amount = options.amount;
    this.price = options.price;
  }

  toStructured() {
    return {
      ...super.toStructured(),
      orderId: this.orderId,
      userId: this.userId,
      side: this.side,
      amount: this.amount,
      price: this.price,
    };
  }
}

/**
 * Order validation errors
 */
export class OrderValidationError extends OrderError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      severity: 'error',
      retryable: false,
    });
    this.validationErrors = options.validationErrors || [];
  }

  toStructured() {
    return {
      ...super.toStructured(),
      validationErrors: this.validationErrors,
    };
  }
}

/**
 * Order matching errors
 */
export class OrderMatchingError extends OrderError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      severity: 'error',
      retryable: options.retryable || true,
    });
    this.matchingContext = options.matchingContext || {};
  }

  toStructured() {
    return {
      ...super.toStructured(),
      matchingContext: this.matchingContext,
    };
  }
}

/**
 * Network and communication errors
 */
export class NetworkError extends TradingSystemError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      severity: options.severity || 'warning',
      retryable: options.retryable || true,
    });
    this.nodeId = options.nodeId;
    this.endpoint = options.endpoint;
    this.statusCode = options.statusCode;
    this.retryAfter = options.retryAfter;
  }

  toStructured() {
    return {
      ...super.toStructured(),
      nodeId: this.nodeId,
      endpoint: this.endpoint,
      statusCode: this.statusCode,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * Grenache service errors
 */
export class GrenacheServiceError extends NetworkError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      severity: 'error',
      retryable: options.retryable || true,
    });
    this.serviceName = options.serviceName;
    this.operation = options.operation;
  }

  toStructured() {
    return {
      ...super.toStructured(),
      serviceName: this.serviceName,
      operation: this.operation,
    };
  }
}

/**
 * Circuit breaker errors
 */
export class CircuitBreakerError extends TradingSystemError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      severity: 'warning',
      retryable: false,
    });
    this.breakerName = options.breakerName;
    this.state = options.state;
    this.failureCount = options.failureCount;
  }

  toStructured() {
    return {
      ...super.toStructured(),
      breakerName: this.breakerName,
      state: this.state,
      failureCount: this.failureCount,
    };
  }
}

/**
 * Performance errors
 */
export class PerformanceError extends TradingSystemError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      severity: options.severity || 'warning',
      retryable: options.retryable || false,
    });
    this.operation = options.operation;
    this.duration = options.duration;
    this.threshold = options.threshold;
    this.metrics = options.metrics || {};
  }

  toStructured() {
    return {
      ...super.toStructured(),
      operation: this.operation,
      duration: this.duration,
      threshold: this.threshold,
      metrics: this.metrics,
    };
  }
}

/**
 * Error context builder for adding structured context to errors
 */
export class ErrorContext {
  constructor() {
    this.context = {};
  }

  /**
   * Add order context
   * @param {Object} order - Order information
   * @returns {ErrorContext} This instance
   */
  withOrder(order) {
    this.context.order = {
      id: order.id,
      userId: order.userId,
      side: order.side,
      amount: order.amount,
      price: order.price,
      timestamp: order.timestamp,
    };
    return this;
  }

  /**
   * Add network context
   * @param {Object} network - Network information
   * @returns {ErrorContext} This instance
   */
  withNetwork(network) {
    this.context.network = {
      nodeId: network.nodeId,
      endpoint: network.endpoint,
      statusCode: network.statusCode,
      latency: network.latency,
    };
    return this;
  }

  /**
   * Add performance context
   * @param {Object} performance - Performance information
   * @returns {ErrorContext} This instance
   */
  withPerformance(performance) {
    this.context.performance = {
      operation: performance.operation,
      duration: performance.duration,
      memoryUsage: performance.memoryUsage,
      cpuUsage: performance.cpuUsage,
    };
    return this;
  }

  /**
   * Add custom context
   * @param {string} key - Context key
   * @param {any} value - Context value
   * @returns {ErrorContext} This instance
   */
  withCustom(key, value) {
    this.context[key] = value;
    return this;
  }

  /**
   * Build final context
   * @returns {Object} Built context
   */
  build() {
    return { ...this.context };
  }
}

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  CRITICAL: 'critical',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  DEBUG: 'debug',
};

/**
 * Security error
 */
export class SecurityError extends TradingSystemError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      errorType: 'SecurityError',
    });
  }
}
