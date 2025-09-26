/**
 * @fileoverview Unit tests for Logger System
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLogger, LogLevel, LogCategory, LogRotator } from '../../src/utils/logger.js';
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
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    it('should create logger with default options', () => {
      logger = createLogger();
      expect(logger).toBeDefined();
      expect(logger.getLevel()).toBe('info');
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
      logger = createLogger({ logDir: customLogDir });

      expect(existsSync(customLogDir)).toBe(true);
    });
  });

  describe('Log Levels', () => {
    beforeEach(() => {
      logger = createLogger({ level: 'debug', logDir });
    });

    it('should log at different levels', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.log('debug', 'Debug message');
      logger.log('info', 'Info message');
      logger.log('warn', 'Warn message');
      logger.log('error', 'Error message');

      expect(spy).toHaveBeenCalledTimes(4);
      spy.mockRestore();
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
      logger = createLogger({ level: 'debug', logDir });
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

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.order(LogLevel.INFO, 'Order created', order, {
        additionalContext: 'test',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Order created'),
        expect.objectContaining({
          category: LogCategory.ORDER,
          order: expect.objectContaining({
            id: 'order123',
            userId: 'user123',
            side: 'buy',
          }),
          additionalContext: 'test',
        })
      );

      spy.mockRestore();
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

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.trade(LogLevel.INFO, 'Trade executed', trade);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Trade executed'),
        expect.objectContaining({
          category: LogCategory.TRADE,
          trade: expect.objectContaining({
            id: 'trade123',
            buyOrderId: 'buy123',
            sellOrderId: 'sell123',
          }),
        })
      );

      spy.mockRestore();
    });

    it('should log network events', () => {
      const network = {
        nodeId: 'node123',
        endpoint: 'http://example.com',
        statusCode: 200,
        latency: 100,
        operation: 'distributeOrder',
      };

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.network(LogLevel.INFO, 'Network request completed', network);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Network request completed'),
        expect.objectContaining({
          category: LogCategory.NETWORK,
          network: expect.objectContaining({
            nodeId: 'node123',
            endpoint: 'http://example.com',
            statusCode: 200,
          }),
        })
      );

      spy.mockRestore();
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

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.performance(LogLevel.WARN, 'Performance threshold exceeded', performance);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Performance threshold exceeded'),
        expect.objectContaining({
          category: LogCategory.PERFORMANCE,
          performance: expect.objectContaining({
            operation: 'addOrder',
            duration: 1500,
            threshold: 1000,
          }),
        })
      );

      spy.mockRestore();
    });

    it('should log error events', () => {
      const error = new Error('Test error');
      error.correlationId = 'err_123';
      error.severity = 'error';
      error.retryable = true;
      error.context = { userId: 'user123' };

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.error(LogLevel.ERROR, 'Error occurred', error, {
        additionalContext: 'test',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred'),
        expect.objectContaining({
          category: LogCategory.ERROR,
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error',
            correlationId: 'err_123',
            severity: 'error',
            retryable: true,
          }),
          additionalContext: 'test',
        })
      );

      spy.mockRestore();
    });

    it('should log system events', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.system(LogLevel.INFO, 'System started', {
        version: '1.0.0',
        environment: 'test',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('System started'),
        expect.objectContaining({
          category: LogCategory.SYSTEM,
          version: '1.0.0',
          environment: 'test',
        })
      );

      spy.mockRestore();
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

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.security(LogLevel.WARN, 'Security event detected', security);

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Security event detected'),
        expect.objectContaining({
          category: LogCategory.SECURITY,
          security: expect.objectContaining({
            event: 'login_attempt',
            userId: 'user123',
            ip: '192.168.1.1',
          }),
        })
      );

      spy.mockRestore();
    });
  });

  describe('Child Loggers', () => {
    beforeEach(() => {
      logger = createLogger({ level: 'debug', logDir });
    });

    it('should create child logger with additional context', () => {
      const childLogger = logger.child({
        component: 'OrderBook',
        pair: 'BTC/USD',
      });

      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      childLogger.log('info', 'Child logger message');

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Child logger message'),
        expect.objectContaining({
          component: 'OrderBook',
          pair: 'BTC/USD',
        })
      );

      spy.mockRestore();
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
      expect(stats).toHaveProperty('environment', 'development');
      expect(stats).toHaveProperty('logDir', logDir);
    });
  });

  describe('Log Flushing', () => {
    beforeEach(() => {
      logger = createLogger({ level: 'debug', logDir });
    });

    it('should flush logs', () => {
      expect(() => logger.flush()).not.toThrow();
    });
  });
});

describe('LogRotator', () => {
  let logDir;
  let rotator;

  beforeEach(() => {
    logDir = join(process.cwd(), 'test-logs-rotator');
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }
    mkdirSync(logDir, { recursive: true });

    rotator = new LogRotator(logDir, 3, 1024); // 3 files, 1KB max size
  });

  afterEach(() => {
    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }
  });

  describe('Rotation Detection', () => {
    it('should detect when rotation is needed', () => {
      const logFile = join(logDir, 'test.log');

      // Create a file larger than max size
      const fs = require('node:fs');
      fs.writeFileSync(logFile, 'x'.repeat(2048)); // 2KB

      expect(rotator.needsRotation(logFile)).toBe(true);
    });

    it('should detect when rotation is not needed', () => {
      const logFile = join(logDir, 'test.log');

      // Create a file smaller than max size
      const fs = require('node:fs');
      fs.writeFileSync(logFile, 'x'.repeat(512)); // 512 bytes

      expect(rotator.needsRotation(logFile)).toBe(false);
    });

    it('should handle non-existent files', () => {
      const logFile = join(logDir, 'nonexistent.log');

      expect(rotator.needsRotation(logFile)).toBe(false);
    });
  });

  describe('Log Rotation', () => {
    it('should rotate log files', () => {
      const logFile = join(logDir, 'test.log');
      const fs = require('node:fs');

      // Create initial log file
      fs.writeFileSync(logFile, 'initial content');

      // Rotate
      rotator.rotate(logFile);

      // Check that files were rotated
      expect(existsSync(`${logFile}.1`)).toBe(true);
      expect(fs.readFileSync(`${logFile}.1`, 'utf8')).toBe('initial content');
    });

    it('should handle multiple rotations', () => {
      const logFile = join(logDir, 'test.log');
      const fs = require('node:fs');

      // Create initial log file
      fs.writeFileSync(logFile, 'content 1');
      rotator.rotate(logFile);

      // Create second log file
      fs.writeFileSync(logFile, 'content 2');
      rotator.rotate(logFile);

      // Check rotation
      expect(existsSync(`${logFile}.1`)).toBe(true);
      expect(existsSync(`${logFile}.2`)).toBe(true);
      expect(fs.readFileSync(`${logFile}.1`, 'utf8')).toBe('content 2');
      expect(fs.readFileSync(`${logFile}.2`, 'utf8')).toBe('content 1');
    });

    it('should delete oldest files when max files exceeded', () => {
      const logFile = join(logDir, 'test.log');
      const fs = require('node:fs');

      // Create and rotate multiple times
      for (let i = 1; i <= 5; i++) {
        fs.writeFileSync(logFile, `content ${i}`);
        rotator.rotate(logFile);
      }

      // Check that only maxFiles are kept
      expect(existsSync(`${logFile}.1`)).toBe(true);
      expect(existsSync(`${logFile}.2`)).toBe(true);
      expect(existsSync(`${logFile}.3`)).toBe(true);
      expect(existsSync(`${logFile}.4`)).toBe(false);
      expect(existsSync(`${logFile}.5`)).toBe(false);
    });
  });
});
