/**
 * @fileoverview Unit tests for Logger System
 */

import { describe, it, expect, beforeEach, vi, afterEach, afterAll } from 'vitest';
import { createLogger, LogLevel, LogCategory, LogRotator } from '../src/utils/logger.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('TradingLogger', () => {
  let logger;
  let logDir;

  beforeEach(() => {
    logDir = join(process.cwd(), 'test-logs');
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }
    mkdirSync(logDir, { recursive: true });
  });

  afterEach(() => {
    // Clean logger to flush any pending writes
    if (logger) {
      logger = null;
    }
  });

  afterAll(() => {
    // Clean up test logs after all tests complete
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should create logger with default options', () => {
      logger = createLogger({ logDir, environment: 'development' });
      expect(logger).toBeDefined();
      expect(logger.getLevel()).toBe('debug');
    });

    it('should create logger with custom options', () => {
      logger = createLogger({
        level: 'debug',
        service: 'test-service',
        nodeId: 'test-node',
        logDir,
      });

      expect(logger.getLevel()).toBe('debug');
      expect(logger.getStats().service).toBe('test-service');
      expect(logger.getStats().nodeId).toBe('test-node');
    });

    it('should create log directory if it does not exist', () => {
      const customLogDir = join(logDir, 'custom');
      logger = createLogger({ logDir: customLogDir, environment: 'development' });

      expect(existsSync(customLogDir)).toBe(true);
    });
  });

  describe('Log Levels', () => {
    beforeEach(() => {
      logger = createLogger({ level: 'debug', logDir, environment: 'development' });
    });

    it('should log at different levels', () => {
      expect(() => {
        logger.log('debug', 'Debug message');
        logger.log('info', 'Info message');
        logger.log('warn', 'Warn message');
        logger.log('error', 'Error message');
      }).not.toThrow();
    });

    it('should set and get log level', () => {
      logger.setLevel('warn');
      expect(logger.getLevel()).toBe('warn');

      logger.setLevel('error');
      expect(logger.getLevel()).toBe('error');
    });
  });

  describe('Structured Logging', () => {
    beforeEach(() => {
      logger = createLogger({ level: 'debug', logDir, environment: 'development' });
    });

    it('should log order events', () => {
      const order = {
        id: 'order123',
        userId: 'user123',
        side: 'buy',
        amount: '1.0',
        price: '50000',
        status: 'pending',
        timestamp: Date.now(),
      };

      expect(() => {
        logger.order(LogLevel.INFO, 'Order created', order, {
          additionalContext: 'test',
        });
      }).not.toThrow();
    });

    it('should log trade events', () => {
      const trade = {
        id: 'trade123',
        buyOrderId: 'buy123',
        sellOrderId: 'sell123',
        amount: '1.0',
        price: '50000',
        timestamp: Date.now(),
      };

      expect(() => {
        logger.trade(LogLevel.INFO, 'Trade executed', trade);
      }).not.toThrow();
    });

    it('should log network events', () => {
      const network = {
        nodeId: 'node123',
        endpoint: 'http://example.com',
        statusCode: 200,
        latency: 100,
        operation: 'distributeOrder',
      };

      expect(() => {
        logger.network(LogLevel.INFO, 'Network request completed', network);
      }).not.toThrow();
    });

    it('should log performance events', () => {
      const performance = {
        operation: 'addOrder',
        duration: 1500,
        threshold: 1000,
        memoryUsage: '100MB',
        cpuUsage: '50%',
        metrics: { ordersPerSecond: 100 },
      };

      expect(() => {
        logger.performance(LogLevel.WARN, 'Performance threshold exceeded', performance);
      }).not.toThrow();
    });

    it('should log error events', () => {
      const error = new Error('Test error');
      error.correlationId = 'err_123';
      error.severity = 'error';
      error.retryable = true;
      error.context = { userId: 'user123' };

      expect(() => {
        logger.error(LogLevel.ERROR, 'Error occurred', error, {
          additionalContext: 'test',
        });
      }).not.toThrow();
    });

    it('should log system events', () => {
      expect(() => {
        logger.system(LogLevel.INFO, 'System started', {
          version: '1.0.0',
          environment: 'test',
        });
      }).not.toThrow();
    });

    it('should log security events', () => {
      const security = {
        event: 'login_attempt',
        userId: 'user123',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        action: 'login',
        resource: '/api/orders',
      };

      expect(() => {
        logger.security(LogLevel.WARN, 'Security event detected', security);
      }).not.toThrow();
    });
  });

  describe('Child Loggers', () => {
    beforeEach(() => {
      logger = createLogger({ level: 'debug', logDir, environment: 'development' });
    });

    it('should create child logger with additional context', () => {
      const childLogger = logger.child({
        component: 'OrderBook',
        pair: 'BTC/USD',
      });

      expect(() => {
        childLogger.log('info', 'Child logger message');
      }).not.toThrow();
    });
  });

  describe('Logger Statistics', () => {
    beforeEach(() => {
      logger = createLogger({
        level: 'info',
        service: 'test-service',
        nodeId: 'test-node',
        logDir,
      });
    });

    it('should provide logger statistics', () => {
      const stats = logger.getStats();

      expect(stats).toHaveProperty('level', 'info');
      expect(stats).toHaveProperty('service', 'test-service');
      expect(stats).toHaveProperty('nodeId', 'test-node');
      expect(stats).toHaveProperty('environment', 'test');
      expect(stats).toHaveProperty('logDir', logDir);
    });
  });

  describe('Log Flushing', () => {
    beforeEach(() => {
      logger = createLogger({ level: 'debug', logDir, environment: 'development' });
    });

    it('should flush logs', () => {
      expect(() => logger.flush()).not.toThrow();
    });
  });
});
