/**
 * @fileoverview Unit tests for Configuration Management System
 * @author Raul JM
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigValidator, Configuration } from '../../src/utils/config.js';

describe('ConfigValidator', () => {
  describe('toNumber', () => {
    it('should convert valid string to number', () => {
      expect(ConfigValidator.toNumber('123', 0)).toBe(123);
      expect(ConfigValidator.toNumber('45.67', 0)).toBe(45.67);
    });

    it('should return default value for empty string', () => {
      expect(ConfigValidator.toNumber('', 42)).toBe(42);
      expect(ConfigValidator.toNumber(null, 42)).toBe(42);
      expect(ConfigValidator.toNumber(undefined, 42)).toBe(42);
    });

    it('should throw error for invalid number', () => {
      expect(() => ConfigValidator.toNumber('abc', 0)).toThrow('Invalid number: abc');
    });

    it('should validate number range', () => {
      expect(ConfigValidator.toNumber('5', 0, 1, 10)).toBe(5);
      expect(() => ConfigValidator.toNumber('15', 0, 1, 10)).toThrow(
        'Number 15 is out of range [1, 10]'
      );
      expect(() => ConfigValidator.toNumber('0', 0, 1, 10)).toThrow(
        'Number 0 is out of range [1, 10]'
      );
    });
  });

  describe('toBoolean', () => {
    it('should convert truthy values to true', () => {
      expect(ConfigValidator.toBoolean('true', false)).toBe(true);
      expect(ConfigValidator.toBoolean('1', false)).toBe(true);
      expect(ConfigValidator.toBoolean('yes', false)).toBe(true);
      expect(ConfigValidator.toBoolean('on', false)).toBe(true);
    });

    it('should convert falsy values to false', () => {
      expect(ConfigValidator.toBoolean('false', true)).toBe(false);
      expect(ConfigValidator.toBoolean('0', true)).toBe(false);
      expect(ConfigValidator.toBoolean('no', true)).toBe(false);
      expect(ConfigValidator.toBoolean('off', true)).toBe(false);
    });

    it('should return default value for empty string', () => {
      expect(ConfigValidator.toBoolean('', true)).toBe(true);
      expect(ConfigValidator.toBoolean(null, false)).toBe(false);
    });

    it('should throw error for invalid boolean', () => {
      expect(() => ConfigValidator.toBoolean('maybe', false)).toThrow('Invalid boolean: maybe');
    });
  });

  describe('toString', () => {
    it('should return string value', () => {
      expect(ConfigValidator.toString('hello', 'default')).toBe('hello');
    });

    it('should return default value for empty string', () => {
      expect(ConfigValidator.toString('', 'default')).toBe('default');
      expect(ConfigValidator.toString(null, 'default')).toBe('default');
    });

    it('should validate against allowed values', () => {
      expect(ConfigValidator.toString('dev', 'prod', ['dev', 'prod'])).toBe('dev');
      expect(() => ConfigValidator.toString('test', 'prod', ['dev', 'prod'])).toThrow(
        'Invalid value: test. Allowed: dev, prod'
      );
    });
  });

  describe('toUrl', () => {
    it('should validate valid URL', () => {
      expect(ConfigValidator.toUrl('http://example.com', 'default')).toBe('http://example.com');
      expect(ConfigValidator.toUrl('https://api.example.com:3000', 'default')).toBe(
        'https://api.example.com:3000'
      );
    });

    it('should return default value for empty string', () => {
      expect(ConfigValidator.toUrl('', 'http://default.com')).toBe('http://default.com');
    });

    it('should throw error for invalid URL', () => {
      expect(() => ConfigValidator.toUrl('not-a-url', 'default')).toThrow('Invalid URL: not-a-url');
    });
  });
});

describe('Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create configuration with default values', () => {
      // Save original NODE_ENV
      const originalNodeEnv = process.env.NODE_ENV;
      // Set to undefined to test default values
      delete process.env.NODE_ENV;

      const config = new Configuration();
      expect(config.environment).toBe('development');
      expect(config.logging.level).toBe('debug');
      expect(config.grenache.url).toBe('http://127.0.0.1:30001');
      expect(config.exchange.pair).toBe('BTC/USD');

      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should use environment variables when available', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_LEVEL = 'warn';
      process.env.GRAPE_URL = 'http://custom:30001';
      process.env.EXCHANGE_PAIR = 'ETH/USD';

      const config = new Configuration();
      expect(config.environment).toBe('production');
      expect(config.logging.level).toBe('warn');
      expect(config.grenache.url).toBe('http://custom:30001');
      expect(config.exchange.pair).toBe('ETH/USD');
    });

    it('should validate configuration values', () => {
      process.env.LOG_LEVEL = 'invalid';
      expect(() => new Configuration()).toThrow(
        'Invalid value: invalid. Allowed: trace, debug, info, warn, error, fatal'
      );
    });

    it('should validate number ranges', () => {
      process.env.PERFORMANCE_THRESHOLD_MS = '10001'; // Should be outside the range
      expect(() => new Configuration()).toThrow('Number 10001 is out of range [1, 10000]');
    });
  });

  describe('getEnvironmentConfig', () => {
    it('should return development config', () => {
      const config = new Configuration();
      const devConfig = config.getEnvironmentConfig('development');

      expect(devConfig.logging.level).toBe('debug');
      expect(devConfig.security.enableRateLimit).toBe(false);
    });

    it('should return production config', () => {
      const config = new Configuration();
      const prodConfig = config.getEnvironmentConfig('production');

      expect(prodConfig.logging.level).toBe('warn');
      expect(prodConfig.security.enableRateLimit).toBe(true);
      expect(prodConfig.performance.thresholdMs).toBe(5);
    });

    it('should return test config', () => {
      const config = new Configuration();
      const testConfig = config.getEnvironmentConfig('test');

      expect(testConfig.logging.level).toBe('error');
      expect(testConfig.exchange.port).toBe(0);
      expect(testConfig.security.enableRateLimit).toBe(false);
    });
  });

  describe('environment checks', () => {
    it('should identify development mode', () => {
      process.env.NODE_ENV = 'development';
      const config = new Configuration();
      expect(config.isDevelopment()).toBe(true);
      expect(config.isProduction()).toBe(false);
      expect(config.isTest()).toBe(false);
    });

    it('should identify production mode', () => {
      process.env.NODE_ENV = 'production';
      const config = new Configuration();
      expect(config.isDevelopment()).toBe(false);
      expect(config.isProduction()).toBe(true);
      expect(config.isTest()).toBe(false);
    });

    it('should identify test mode', () => {
      process.env.NODE_ENV = 'test';
      const config = new Configuration();
      expect(config.isDevelopment()).toBe(false);
      expect(config.isProduction()).toBe(false);
      expect(config.isTest()).toBe(true);
    });
  });

  describe('getSummary', () => {
    it('should return configuration summary', () => {
      const config = new Configuration();
      const summary = config.getSummary();

      expect(summary).toHaveProperty('environment');
      expect(summary).toHaveProperty('logging');
      expect(summary).toHaveProperty('exchange');
      expect(summary).toHaveProperty('grenache');
      expect(summary).toHaveProperty('performance');
      expect(summary).toHaveProperty('circuitBreaker');
    });
  });

  describe('reload', () => {
    it('should reload configuration', () => {
      const config = new Configuration();
      const originalLevel = config.logging.level;

      process.env.LOG_LEVEL = 'error';
      config.reload();

      expect(config.logging.level).toBe('error');
      expect(config.logging.level).not.toBe(originalLevel);
    });
  });
});
