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
 * Configuration errors
 */
export class ConfigurationError extends TradingSystemError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      severity: 'error',
      retryable: false,
    });
    this.configKey = options.configKey;
    this.expectedType = options.expectedType;
    this.actualValue = options.actualValue;
  }

  toStructured() {
    return {
      ...super.toStructured(),
      configKey: this.configKey,
      expectedType: this.expectedType,
      actualValue: this.actualValue,
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
 * Error recovery strategies
 */
export class ErrorRecovery {
  static strategies = {
    RETRY: 'retry',
    FALLBACK: 'fallback',
    CIRCUIT_BREAK: 'circuit_break',
    GRACEFUL_DEGRADATION: 'graceful_degradation',
    FAIL_FAST: 'fail_fast',
  };

  /**
   * Determine recovery strategy based on error type
   * @param {TradingSystemError} error - Error to analyze
   * @returns {string} Recovery strategy
   */
  static determineStrategy(error) {
    if (error instanceof NetworkError && error.isRetryable()) {
      return this.strategies.RETRY;
    }

    if (error instanceof CircuitBreakerError) {
      return this.strategies.CIRCUIT_BREAK;
    }

    if (error instanceof OrderValidationError) {
      return this.strategies.FAIL_FAST;
    }

    if (error instanceof PerformanceError) {
      return this.strategies.GRACEFUL_DEGRADATION;
    }

    if (error instanceof GrenacheServiceError) {
      return this.strategies.FALLBACK;
    }

    return this.strategies.FAIL_FAST;
  }

  /**
   * Execute recovery strategy
   * @param {TradingSystemError} error - Error to recover from
   * @param {Function} operation - Operation to retry/fallback
   * @param {Object} options - Recovery options
   * @returns {Promise<any>} Recovery result
   */
  static async executeRecovery(error, operation, options = {}) {
    const strategy = this.determineStrategy(error);

    switch (strategy) {
      case this.strategies.RETRY:
        return this.retryOperation(operation, options);
      case this.strategies.FALLBACK:
        return this.fallbackOperation(operation, options);
      case this.strategies.CIRCUIT_BREAK:
        return this.circuitBreakOperation(error, options);
      case this.strategies.GRACEFUL_DEGRADATION:
        return this.gracefulDegradationOperation(operation, options);
      case this.strategies.FAIL_FAST:
      default:
        throw error;
    }
  }

  /**
   * Retry operation with exponential backoff
   * @param {Function} operation - Operation to retry
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Operation result
   */
  static async retryOperation(operation, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const baseDelay = options.baseDelay || 1000;
    const maxDelay = options.maxDelay || 10000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries || !error.isRetryable()) {
          throw error;
        }

        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Fallback operation
   * @param {Function} operation - Primary operation
   * @param {Object} options - Fallback options
   * @returns {Promise<any>} Operation result
   */
  static async fallbackOperation(operation, options = {}) {
    try {
      return await operation();
    } catch (error) {
      if (options.fallback) {
        return await options.fallback(error);
      }
      throw error;
    }
  }

  /**
   * Circuit break operation
   * @param {TradingSystemError} error - Circuit breaker error
   * @param {Object} options - Circuit break options
   * @returns {Promise<any>} Operation result
   */
  static async circuitBreakOperation(error, options = {}) {
    if (options.circuitBreaker) {
      return options.circuitBreaker.execute(options.operation);
    }
    throw error;
  }

  /**
   * Graceful degradation operation
   * @param {Function} operation - Operation to degrade
   * @param {Object} options - Degradation options
   * @returns {Promise<any>} Operation result
   */
  static async gracefulDegradationOperation(operation, options = {}) {
    try {
      return await operation();
    } catch (error) {
      if (options.degradedOperation) {
        return await options.degradedOperation(error);
      }
      throw error;
    }
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
 * Error categories for classification
 */
export const ErrorCategory = {
  VALIDATION: 'validation',
  NETWORK: 'network',
  PERFORMANCE: 'performance',
  CONFIGURATION: 'configuration',
  BUSINESS_LOGIC: 'business_logic',
  EXTERNAL_SERVICE: 'external_service',
  INFRASTRUCTURE: 'infrastructure',
};
