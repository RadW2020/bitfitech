/**
 * @fileoverview Enterprise Logging System
 * Structured logging with Pino for financial trading systems
 *
 * Features:
 * - Structured JSON logging
 * - File rotation and management
 * - Performance logging
 * - Error correlation
 * - Configurable log levels
 *
 * @author Raul JM
 */

import pino from 'pino';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Log levels for the trading system
 */
export const LogLevel = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
};

/**
 * Log categories for structured logging
 */
export const LogCategory = {
  ORDER: 'order',
  TRADE: 'trade',
  NETWORK: 'network',
  PERFORMANCE: 'performance',
  SECURITY: 'security',
  SYSTEM: 'system',
  ERROR: 'error',
};

/**
 * Enterprise Logger class for financial trading systems
 */
class TradingLogger {
  constructor(options = {}) {
    this.options = {
      level: options.level || config.logging.level,
      environment: options.environment || config.environment,
      service: options.service || 'p2p-exchange',
      nodeId: options.nodeId || 'unknown',
      logDir: options.logDir || config.logging.directory,
      ...options,
    };

    this.#ensureLogDirectory();
    this.logger = this.#createLogger();
  }

  /**
   * Ensure log directory exists
   * @private
   */
  #ensureLogDirectory() {
    if (!existsSync(this.options.logDir)) {
      mkdirSync(this.options.logDir, { recursive: true });
    }
  }

  /**
   * Create Pino logger instance
   * @returns {pino.Logger} Pino logger
   * @private
   */
  #createLogger() {
    const isDevelopment = this.options.environment === 'development';

    const baseConfig = {
      level: this.options.level,
      base: {
        service: this.options.service,
        nodeId: this.options.nodeId,
        environment: this.options.environment,
        pid: process.pid,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: label => ({ level: label }),
      },
    };

    // Development: pretty print to console
    if (isDevelopment) {
      return pino({
        ...baseConfig,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      });
    }

    // Production: structured JSON to file
    return pino(
      baseConfig,
      pino.destination({
        dest: join(this.options.logDir, `${this.options.service}.log`),
        sync: false, // Async for better performance
      })
    );
  }

  /**
   * Log order-related events
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} order - Order information
   * @param {Object} context - Additional context
   */
  order(level, message, order, context = {}) {
    this.logger[level](
      {
        category: LogCategory.ORDER,
        order: {
          id: order.id,
          userId: order.userId,
          side: order.side,
          amount: order.amount,
          price: order.price,
          status: order.status,
          timestamp: order.timestamp,
        },
        ...context,
      },
      message
    );
  }

  /**
   * Log trade-related events
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} trade - Trade information
   * @param {Object} context - Additional context
   */
  trade(level, message, trade, context = {}) {
    this.logger[level](
      {
        category: LogCategory.TRADE,
        trade: {
          id: trade.id,
          buyOrderId: trade.buyOrderId,
          sellOrderId: trade.sellOrderId,
          amount: trade.amount,
          price: trade.price,
          timestamp: trade.timestamp,
        },
        ...context,
      },
      message
    );
  }

  /**
   * Log network-related events
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} network - Network information
   * @param {Object} context - Additional context
   */
  network(level, message, network, context = {}) {
    this.logger[level](
      {
        category: LogCategory.NETWORK,
        network: {
          nodeId: network.nodeId,
          endpoint: network.endpoint,
          statusCode: network.statusCode,
          latency: network.latency,
          operation: network.operation,
        },
        ...context,
      },
      message
    );
  }

  /**
   * Log performance-related events
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} performance - Performance information
   * @param {Object} context - Additional context
   */
  performance(level, message, performance, context = {}) {
    this.logger[level](
      {
        category: LogCategory.PERFORMANCE,
        performance: {
          operation: performance.operation,
          duration: performance.duration,
          threshold: performance.threshold,
          memoryUsage: performance.memoryUsage,
          cpuUsage: performance.cpuUsage,
          metrics: performance.metrics,
        },
        ...context,
      },
      message
    );
  }

  /**
   * Log error events with structured context
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  error(level, message, error, context = {}) {
    const errorContext = {
      category: LogCategory.ERROR,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        correlationId: error.correlationId,
        severity: error.severity,
        retryable: error.retryable,
        context: error.context,
      },
      ...context,
    };

    this.logger[level](errorContext, message);
  }

  /**
   * Log system events
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  system(level, message, context = {}) {
    this.logger[level](
      {
        category: LogCategory.SYSTEM,
        ...context,
      },
      message
    );
  }

  /**
   * Log security events
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} security - Security information
   * @param {Object} context - Additional context
   */
  security(level, message, security, context = {}) {
    this.logger[level](
      {
        category: LogCategory.SECURITY,
        security: {
          event: security.event,
          userId: security.userId,
          ip: security.ip,
          userAgent: security.userAgent,
          action: security.action,
          resource: security.resource,
        },
        ...context,
      },
      message
    );
  }

  /**
   * Generic log method
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  log(level, message, context = {}) {
    this.logger[level](context, message);
  }

  /**
   * Create child logger with additional context
   * @param {Object} context - Additional context for child logger
   * @returns {TradingLogger} Child logger instance
   */
  child(context) {
    const childLogger = new TradingLogger(this.options);
    childLogger.logger = this.logger.child(context);
    return childLogger;
  }

  /**
   * Get current log level
   * @returns {string} Current log level
   */
  getLevel() {
    return this.logger.level;
  }

  /**
   * Set log level
   * @param {string} level - New log level
   */
  setLevel(level) {
    this.logger.level = level;
  }

  /**
   * Flush logs (useful for testing)
   */
  flush() {
    if (this.logger.flush) {
      this.logger.flush();
    }
  }

  /**
   * Get logger statistics
   * @returns {Object} Logger statistics
   */
  getStats() {
    return {
      level: this.logger.level,
      service: this.options.service,
      nodeId: this.options.nodeId,
      environment: this.options.environment,
      logDir: this.options.logDir,
    };
  }
}

/**
 * Create default logger instance
 * @param {Object} options - Logger options
 * @returns {TradingLogger} Logger instance
 */
export function createLogger(options = {}) {
  return new TradingLogger(options);
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Log rotation utility (simple file-based rotation)
 */
export class LogRotator {
  constructor(logDir, maxFiles = null, maxSize = null) {
    this.logDir = logDir;
    this.maxFiles = maxFiles || config.logging.maxFiles;
    this.maxSize = maxSize || config.logging.maxSizeMB * 1024 * 1024;
  }

  /**
   * Check if log rotation is needed
   * @param {string} logFile - Log file path
   * @returns {boolean} Whether rotation is needed
   */
  needsRotation(logFile) {
    try {
      const stats = require('node:fs').statSync(logFile);
      return stats.size > this.maxSize;
    } catch (error) {
      return false;
    }
  }

  /**
   * Rotate log file
   * @param {string} logFile - Log file path
   */
  rotate(logFile) {
    const fs = require('node:fs');
    const path = require('node:path');

    try {
      // Move existing files
      for (let i = this.maxFiles - 1; i > 0; i--) {
        const oldFile = `${logFile}.${i}`;
        const newFile = `${logFile}.${i + 1}`;

        if (fs.existsSync(oldFile)) {
          if (i === this.maxFiles - 1) {
            fs.unlinkSync(oldFile); // Delete oldest
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // Move current log to .1
      if (fs.existsSync(logFile)) {
        fs.renameSync(logFile, `${logFile}.1`);
      }
    } catch (error) {
      console.error('Log rotation failed:', error);
    }
  }
}

export default TradingLogger;
