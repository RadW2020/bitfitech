/**
 * @fileoverview Unit tests for Error Handling System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TradingSystemError,
  OrderError,
  OrderValidationError,
  OrderMatchingError,
  NetworkError,
  GrenacheServiceError,
  CircuitBreakerError,
  ConfigurationError,
  PerformanceError,
  ErrorContext,
  ErrorSeverity,
  ErrorCategory,
} from '../src/utils/errors.js';

describe('Error Handling System', () => {
  describe('TradingSystemError', () => {
    it('should create error with basic properties', () => {
      const error = new TradingSystemError('Test error');

      expect(error.name).toBe('TradingSystemError');
      expect(error.message).toBe('Test error');
      expect(error.timestamp).toBeDefined();
      expect(error.context).toEqual({});
      expect(error.severity).toBe('error');
      expect(error.retryable).toBe(false);
      expect(error.correlationId).toBeDefined();
    });

    it('should create error with custom options', () => {
      const context = { userId: 'user123' };
      const error = new TradingSystemError('Test error', {
        context,
        severity: 'warning',
        retryable: true,
      });

      expect(error.context).toEqual(context);
      expect(error.severity).toBe('warning');
      expect(error.retryable).toBe(true);
    });

    it('should generate unique correlation IDs', () => {
      const error1 = new TradingSystemError('Error 1');
      const error2 = new TradingSystemError('Error 2');

      expect(error1.correlationId).not.toBe(error2.correlationId);
    });

    it('should convert to structured format', () => {
      const error = new TradingSystemError('Test error', {
        context: { userId: 'user123' },
        severity: 'warning',
        retryable: true,
      });

      const structured = error.toStructured();

      expect(structured).toHaveProperty('name', 'TradingSystemError');
      expect(structured).toHaveProperty('message', 'Test error');
      expect(structured).toHaveProperty('timestamp');
      expect(structured).toHaveProperty('correlationId');
      expect(structured).toHaveProperty('severity', 'warning');
      expect(structured).toHaveProperty('retryable', true);
      expect(structured).toHaveProperty('context', { userId: 'user123' });
      expect(structured).toHaveProperty('stack');
    });

    it('should check if error is retryable', () => {
      const retryableError = new TradingSystemError('Test', { retryable: true });
      const nonRetryableError = new TradingSystemError('Test', { retryable: false });

      expect(retryableError.isRetryable()).toBe(true);
      expect(nonRetryableError.isRetryable()).toBe(false);
    });

    it('should get error severity', () => {
      const error = new TradingSystemError('Test', { severity: 'critical' });
      expect(error.getSeverity()).toBe('critical');
    });
  });

  describe('OrderError', () => {
    it('should create order error with order context', () => {
      const error = new OrderError('Invalid order', {
        orderId: 'order123',
        userId: 'user123',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      });

      expect(error.orderId).toBe('order123');
      expect(error.userId).toBe('user123');
      expect(error.side).toBe('buy');
      expect(error.amount).toBe('1.0');
      expect(error.price).toBe('50000');
    });

    it('should include order context in structured format', () => {
      const error = new OrderError('Invalid order', {
        orderId: 'order123',
        userId: 'user123',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      });

      const structured = error.toStructured();

      expect(structured).toHaveProperty('orderId', 'order123');
      expect(structured).toHaveProperty('userId', 'user123');
      expect(structured).toHaveProperty('side', 'buy');
      expect(structured).toHaveProperty('amount', '1.0');
      expect(structured).toHaveProperty('price', '50000');
    });
  });

  describe('OrderValidationError', () => {
    it('should create validation error with validation details', () => {
      const validationErrors = [
        { field: 'amount', message: 'Must be positive', value: '-1' },
        { field: 'price', message: 'Must be positive', value: '0' },
      ];

      const error = new OrderValidationError('Validation failed', {
        validationErrors,
      });

      expect(error.validationErrors).toEqual(validationErrors);
      expect(error.severity).toBe('error');
      expect(error.retryable).toBe(false);
    });

    it('should include validation errors in structured format', () => {
      const validationErrors = [{ field: 'amount', message: 'Must be positive', value: '-1' }];

      const error = new OrderValidationError('Validation failed', {
        validationErrors,
      });

      const structured = error.toStructured();

      expect(structured).toHaveProperty('validationErrors', validationErrors);
    });
  });

  describe('OrderMatchingError', () => {
    it('should create matching error with matching context', () => {
      const error = new OrderMatchingError('Matching failed', {
        matchingContext: { originalError: 'Network timeout' },
        retryable: true,
      });

      expect(error.matchingContext).toEqual({ originalError: 'Network timeout' });
      expect(error.retryable).toBe(true);
    });
  });

  describe('NetworkError', () => {
    it('should create network error with network context', () => {
      const error = new NetworkError('Connection failed', {
        nodeId: 'node123',
        endpoint: 'http://example.com',
        statusCode: 500,
        retryAfter: 5000,
      });

      expect(error.nodeId).toBe('node123');
      expect(error.endpoint).toBe('http://example.com');
      expect(error.statusCode).toBe(500);
      expect(error.retryAfter).toBe(5000);
      expect(error.severity).toBe('warning');
      expect(error.retryable).toBe(true);
    });
  });

  describe('GrenacheServiceError', () => {
    it('should create grenache service error', () => {
      const error = new GrenacheServiceError('Service unavailable', {
        serviceName: 'p2p_exchange',
        operation: 'distributeOrder',
      });

      expect(error.serviceName).toBe('p2p_exchange');
      expect(error.operation).toBe('distributeOrder');
      expect(error.severity).toBe('error');
      expect(error.retryable).toBe(true);
    });
  });

  describe('CircuitBreakerError', () => {
    it('should create circuit breaker error', () => {
      const error = new CircuitBreakerError('Circuit is open', {
        breakerName: 'test-breaker',
        state: 'OPEN',
        failureCount: 5,
      });

      expect(error.breakerName).toBe('test-breaker');
      expect(error.state).toBe('OPEN');
      expect(error.failureCount).toBe(5);
      expect(error.severity).toBe('warning');
      expect(error.retryable).toBe(false);
    });
  });


  describe('PerformanceError', () => {
    it('should create performance error', () => {
      const error = new PerformanceError('Operation too slow', {
        operation: 'addOrder',
        duration: 1500,
        threshold: 1000,
        metrics: { memoryUsage: '100MB' },
      });

      expect(error.operation).toBe('addOrder');
      expect(error.duration).toBe(1500);
      expect(error.threshold).toBe(1000);
      expect(error.metrics).toEqual({ memoryUsage: '100MB' });
    });
  });


  describe('ErrorContext', () => {
    it('should build context with order information', () => {
      const order = {
        id: 'order123',
        userId: 'user123',
        side: 'buy',
        amount: '1.0',
        price: '50000',
        timestamp: Date.now(),
      };

      const context = new ErrorContext().withOrder(order).build();

      expect(context).toHaveProperty('order', order);
    });

    it('should build context with network information', () => {
      const network = {
        nodeId: 'node123',
        endpoint: 'http://example.com',
        statusCode: 500,
        latency: 1000,
      };

      const context = new ErrorContext().withNetwork(network).build();

      expect(context).toHaveProperty('network', network);
    });

    it('should build context with performance information', () => {
      const performance = {
        operation: 'addOrder',
        duration: 1500,
        memoryUsage: '100MB',
        cpuUsage: '50%',
      };

      const context = new ErrorContext().withPerformance(performance).build();

      expect(context).toHaveProperty('performance', performance);
    });

    it('should build context with custom information', () => {
      const context = new ErrorContext()
        .withCustom('customKey', 'customValue')
        .withCustom('anotherKey', 123)
        .build();

      expect(context).toHaveProperty('customKey', 'customValue');
      expect(context).toHaveProperty('anotherKey', 123);
    });

    it('should chain multiple context builders', () => {
      const order = { id: 'order123', userId: 'user123' };
      const network = { nodeId: 'node123', endpoint: 'http://example.com' };

      const context = new ErrorContext()
        .withOrder(order)
        .withNetwork(network)
        .withCustom('customKey', 'customValue')
        .build();

      expect(context).toHaveProperty('order', order);
      expect(context).toHaveProperty('network', network);
      expect(context).toHaveProperty('customKey', 'customValue');
    });
  });

  describe('Error Severity and Categories', () => {
    it('should have correct severity levels', () => {
      expect(ErrorSeverity.CRITICAL).toBe('critical');
      expect(ErrorSeverity.ERROR).toBe('error');
      expect(ErrorSeverity.WARNING).toBe('warning');
      expect(ErrorSeverity.INFO).toBe('info');
      expect(ErrorSeverity.DEBUG).toBe('debug');
    });

  });
});
