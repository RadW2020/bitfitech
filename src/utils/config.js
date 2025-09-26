/**
 * @fileoverview Configuration Management System
 * Centralized configuration with environment variables and validation
 *
 * Features:
 * - Environment variable loading
 * - Configuration validation
 * - Default values
 * - Type conversion
 * - Configuration profiles
 *
 * @author Raul JM
 */

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

/**
 * Configuration validation and type conversion utilities
 */
class ConfigValidator {
  /**
   * Validate and convert string to number
   * @param {string} value - String value to convert
   * @param {number} defaultValue - Default value if conversion fails
   * @param {number} min - Minimum allowed value
   * @param {number} max - Maximum allowed value
   * @returns {number} Converted and validated number
   */
  static toNumber(value, defaultValue, min = -Infinity, max = Infinity) {
    if (!value) return defaultValue;

    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Invalid number: ${value}`);
    }

    if (num < min || num > max) {
      throw new Error(`Number ${num} is out of range [${min}, ${max}]`);
    }

    return num;
  }

  /**
   * Validate and convert string to boolean
   * @param {string} value - String value to convert
   * @param {boolean} defaultValue - Default value if conversion fails
   * @returns {boolean} Converted boolean
   */
  static toBoolean(value, defaultValue) {
    if (!value) return defaultValue;

    const lowerValue = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lowerValue)) return true;
    if (['false', '0', 'no', 'off'].includes(lowerValue)) return false;

    throw new Error(`Invalid boolean: ${value}`);
  }

  /**
   * Validate string value
   * @param {string} value - String value to validate
   * @param {string} defaultValue - Default value if validation fails
   * @param {string[]} allowedValues - Allowed values (optional)
   * @returns {string} Validated string
   */
  static toString(value, defaultValue, allowedValues = null) {
    if (!value) return defaultValue;

    if (allowedValues && !allowedValues.includes(value)) {
      throw new Error(`Invalid value: ${value}. Allowed: ${allowedValues.join(', ')}`);
    }

    return value;
  }

  /**
   * Validate URL
   * @param {string} value - URL string to validate
   * @param {string} defaultValue - Default value if validation fails
   * @returns {string} Validated URL
   */
  static toUrl(value, defaultValue) {
    if (!value) return defaultValue;

    try {
      new URL(value);
      return value;
    } catch (error) {
      throw new Error(`Invalid URL: ${value}`);
    }
  }
}

/**
 * Main configuration class
 */
class Configuration {
  constructor() {
    this.#loadConfiguration();
    this.#validateConfiguration();
  }

  /**
   * Load configuration from environment variables
   * @private
   */
  #loadConfiguration() {
    // Environment
    this.environment = ConfigValidator.toString(process.env.NODE_ENV, 'development', [
      'development',
      'staging',
      'production',
      'test',
    ]);

    // Logging Configuration
    this.logging = {
      level: ConfigValidator.toString(
        process.env.LOG_LEVEL,
        this.environment === 'development' ? 'debug' : 'info',
        ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
      ),
      directory: ConfigValidator.toString(process.env.LOG_DIR, join(__dirname, '../logs')),
      maxFiles: ConfigValidator.toNumber(process.env.LOG_MAX_FILES, 10, 1, 100),
      maxSizeMB: ConfigValidator.toNumber(process.env.LOG_MAX_SIZE_MB, 10, 1, 1000),
    };

    // Grenache Configuration
    this.grenache = {
      url: ConfigValidator.toUrl(process.env.GRAPE_URL, 'http://127.0.0.1:30001'),
    };

    // Exchange Configuration
    this.exchange = {
      pair: ConfigValidator.toString(process.env.EXCHANGE_PAIR, 'BTC/USD'),
      port: ConfigValidator.toNumber(process.env.EXCHANGE_PORT, 3000, 1000, 65535),
    };

    // Performance Configuration
    this.performance = {
      thresholdMs: ConfigValidator.toNumber(process.env.PERFORMANCE_THRESHOLD_MS, 10, 1, 10000),
      maxOrderAmount: ConfigValidator.toNumber(
        process.env.MAX_ORDER_AMOUNT,
        1000000,
        1,
        1000000000
      ),
      maxOrderPrice: ConfigValidator.toNumber(process.env.MAX_ORDER_PRICE, 1000000, 1, 1000000000),
    };

    // Circuit Breaker Configuration
    this.circuitBreaker = {
      failureThreshold: ConfigValidator.toNumber(
        process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
        3,
        1,
        100
      ),
      resetTimeoutMs: ConfigValidator.toNumber(
        process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
        30000,
        1000,
        300000
      ),
    };

    // Security Configuration
    this.security = {
      enableRateLimit: ConfigValidator.toBoolean(process.env.ENABLE_RATE_LIMIT, false),
      maxRequestsPerMinute: ConfigValidator.toNumber(
        process.env.MAX_REQUESTS_PER_MINUTE,
        1000,
        1,
        10000
      ),
      maxOrdersPerMinute: ConfigValidator.toNumber(process.env.MAX_ORDERS_PER_MINUTE, 100, 1, 1000),
      maxOrdersPerSecond: ConfigValidator.toNumber(process.env.MAX_ORDERS_PER_SECOND, 10, 1, 100),
      maxMessageSize:
        ConfigValidator.toNumber(process.env.MAX_MESSAGE_SIZE_KB, 1024, 1, 10000) * 1024,
      enableCORS: ConfigValidator.toBoolean(process.env.ENABLE_CORS, true),
    };

    // Monitoring Configuration
    this.monitoring = {
      enableMetrics: ConfigValidator.toBoolean(process.env.ENABLE_METRICS, true),
      metricsPort: ConfigValidator.toNumber(process.env.METRICS_PORT, 9090, 1000, 65535),
      healthCheckInterval: ConfigValidator.toNumber(
        process.env.HEALTH_CHECK_INTERVAL_MS,
        30000,
        1000,
        300000
      ),
    };
  }

  /**
   * Validate configuration
   * @private
   */
  #validateConfiguration() {
    const errors = [];

    // Validate logging directory
    if (!existsSync(this.logging.directory)) {
      try {
        const fs = require('node:fs');
        fs.mkdirSync(this.logging.directory, { recursive: true });
      } catch (error) {
        errors.push(`Cannot create log directory: ${this.logging.directory}`);
      }
    }

    // Validate port conflicts
    if (this.exchange.port === this.monitoring.metricsPort) {
      errors.push('Exchange port and metrics port cannot be the same');
    }

    // Validate performance thresholds
    if (this.performance.maxOrderAmount <= 0) {
      errors.push('Max order amount must be positive');
    }

    if (this.performance.maxOrderPrice <= 0) {
      errors.push('Max order price must be positive');
    }

    // Validate circuit breaker settings
    if (this.circuitBreaker.failureThreshold <= 0) {
      errors.push('Circuit breaker failure threshold must be positive');
    }

    if (this.circuitBreaker.resetTimeoutMs <= 0) {
      errors.push('Circuit breaker reset timeout must be positive');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Get configuration for a specific environment
   * @param {string} env - Environment name
   * @returns {Object} Environment-specific configuration
   */
  getEnvironmentConfig(env = this.environment) {
    const baseConfig = {
      logging: this.logging,
      grenache: this.grenache,
      exchange: this.exchange,
      performance: this.performance,
      circuitBreaker: this.circuitBreaker,
      security: this.security,
      monitoring: this.monitoring,
    };

    switch (env) {
      case 'development':
        return {
          ...baseConfig,
          logging: {
            ...baseConfig.logging,
            level: 'debug',
          },
          security: {
            ...baseConfig.security,
            enableRateLimit: false,
          },
        };

      case 'staging':
        return {
          ...baseConfig,
          logging: {
            ...baseConfig.logging,
            level: 'info',
          },
          security: {
            ...baseConfig.security,
            enableRateLimit: true,
            maxRequestsPerMinute: 500,
          },
        };

      case 'production':
        return {
          ...baseConfig,
          logging: {
            ...baseConfig.logging,
            level: 'warn',
          },
          security: {
            ...baseConfig.security,
            enableRateLimit: true,
            maxRequestsPerMinute: 1000,
          },
          performance: {
            ...baseConfig.performance,
            thresholdMs: 5, // Stricter in production
          },
        };

      case 'test':
        return {
          ...baseConfig,
          logging: {
            ...baseConfig.logging,
            level: 'error',
          },
          exchange: {
            ...baseConfig.exchange,
            port: 0, // Random port for tests
          },
          security: {
            ...baseConfig.security,
            enableRateLimit: false,
          },
        };

      default:
        return baseConfig;
    }
  }

  /**
   * Get all configuration
   * @returns {Object} Complete configuration
   */
  getAll() {
    return {
      environment: this.environment,
      ...this.getEnvironmentConfig(),
    };
  }

  /**
   * Get configuration summary for logging
   * @returns {Object} Configuration summary
   */
  getSummary() {
    return {
      environment: this.environment,
      logging: {
        level: this.logging.level,
        directory: this.logging.directory,
      },
      exchange: {
        pair: this.exchange.pair,
        port: this.exchange.port,
      },
      grenache: {
        url: this.grenache.url,
      },
      performance: {
        thresholdMs: this.performance.thresholdMs,
      },
      circuitBreaker: {
        failureThreshold: this.circuitBreaker.failureThreshold,
        resetTimeoutMs: this.circuitBreaker.resetTimeoutMs,
      },
    };
  }

  /**
   * Check if running in development mode
   * @returns {boolean} Is development mode
   */
  isDevelopment() {
    return this.environment === 'development';
  }

  /**
   * Check if running in production mode
   * @returns {boolean} Is production mode
   */
  isProduction() {
    return this.environment === 'production';
  }

  /**
   * Check if running in test mode
   * @returns {boolean} Is test mode
   */
  isTest() {
    return this.environment === 'test';
  }

  /**
   * Reload configuration (useful for testing)
   */
  reload() {
    this.#loadConfiguration();
    this.#validateConfiguration();
  }
}

// Create singleton instance
const configuration = new Configuration();

export default configuration;
export { ConfigValidator, Configuration };
