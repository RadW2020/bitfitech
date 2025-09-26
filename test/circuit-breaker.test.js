/**
 * @fileoverview Unit tests for CircuitBreaker class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import CircuitBreaker from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      name: 'test-circuit',
      failureThreshold: 3,
      resetTimeout: 1000, // 1 second for testing
    });
  });

  describe('Constructor', () => {
    it('should initialize with default values', () => {
      const defaultBreaker = new CircuitBreaker();
      expect(defaultBreaker.name).toBe('circuit-breaker');
      expect(defaultBreaker.state).toBe(CircuitBreaker.STATES.CLOSED);
      expect(defaultBreaker.failureCount).toBe(0);
    });

    it('should initialize with custom values', () => {
      expect(circuitBreaker.name).toBe('test-circuit');
      expect(circuitBreaker.state).toBe(CircuitBreaker.STATES.CLOSED);
      expect(circuitBreaker.failureCount).toBe(0);
    });
  });

  describe('State Management', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.isClosed()).toBe(true);
      expect(circuitBreaker.isOpen()).toBe(false);
      expect(circuitBreaker.isHalfOpen()).toBe(false);
    });

    it('should transition to OPEN state after failure threshold', async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'));

      // Execute failing operations up to threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);
      expect(circuitBreaker.isClosed()).toBe(false);
    });

    it('should fail fast when circuit is OPEN', async () => {
      // Open the circuit
      const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      // Try to execute operation when circuit is open
      const operation = vi.fn().mockResolvedValue('success');

      await expect(circuitBreaker.execute(operation)).rejects.toThrow(
        'Circuit breaker test-circuit is OPEN - failing fast'
      );

      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Operation Execution', () => {
    it('should execute successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle operation failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Test error');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should reset failure count on success', async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'));
      const successOperation = vi.fn().mockResolvedValue('success');

      // Cause 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.failureCount).toBe(2);

      // Execute successful operation
      await circuitBreaker.execute(successOperation);

      expect(circuitBreaker.failureCount).toBe(0);
    });
  });

  describe('Half-Open State', () => {
    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Open the circuit
      const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Try to execute operation (should transition to HALF_OPEN)
      const operation = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);

      expect(circuitBreaker.isHalfOpen()).toBe(true);
    });

    it('should close circuit after successful operations in HALF_OPEN', async () => {
      // Open the circuit
      const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Execute successful operations in HALF_OPEN state
      const successOperation = vi.fn().mockResolvedValue('success');
      for (let i = 0; i < 2; i++) {
        // Need 2 successes (threshold/2)
        await circuitBreaker.execute(successOperation);
      }

      expect(circuitBreaker.isClosed()).toBe(true);
    });

    it('should return to OPEN if operation fails in HALF_OPEN', async () => {
      // Open the circuit
      const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Execute failing operation in HALF_OPEN state
      try {
        await circuitBreaker.execute(failingOperation);
      } catch (error) {
        // Expected to fail
      }

      expect(circuitBreaker.isOpen()).toBe(true);
    });
  });

  describe('Status and Metrics', () => {
    it('should provide status information', () => {
      const status = circuitBreaker.getStatus();

      expect(status).toHaveProperty('name', 'test-circuit');
      expect(status).toHaveProperty('state', CircuitBreaker.STATES.CLOSED);
      expect(status).toHaveProperty('failureCount', 0);
      expect(status).toHaveProperty('failureThreshold', 3);
      expect(status).toHaveProperty('resetTimeout', 1000);
    });

    it('should provide metrics information', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);

      const metrics = circuitBreaker.getMetrics();

      expect(metrics).toHaveProperty('totalRequests', 1);
      expect(metrics).toHaveProperty('totalSuccesses', 1);
      expect(metrics).toHaveProperty('totalFailures', 0);
      expect(metrics).toHaveProperty('successRate', 100);
      expect(metrics).toHaveProperty('failureRate', 0);
    });

    it('should calculate success and failure rates correctly', async () => {
      const successOperation = vi.fn().mockResolvedValue('success');
      const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'));

      // Execute 2 successful operations
      await circuitBreaker.execute(successOperation);
      await circuitBreaker.execute(successOperation);

      // Execute 1 failing operation
      try {
        await circuitBreaker.execute(failingOperation);
      } catch (error) {
        // Expected to fail
      }

      const metrics = circuitBreaker.getMetrics();

      expect(metrics.totalRequests).toBe(3);
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.totalFailures).toBe(1);
      expect(metrics.successRate).toBe(66.67);
      expect(metrics.failureRate).toBe(33.33);
    });
  });

  describe('Manual Reset', () => {
    it('should reset circuit breaker to CLOSED state', async () => {
      // Open the circuit
      const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'));
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);

      // Reset circuit breaker
      circuitBreaker.reset();

      expect(circuitBreaker.isClosed()).toBe(true);
      expect(circuitBreaker.failureCount).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle operations that throw non-Error objects', async () => {
      const operation = vi.fn().mockRejectedValue('string error');

      await expect(circuitBreaker.execute(operation)).rejects.toBe('string error');
      expect(circuitBreaker.failureCount).toBe(1);
    });

    it('should handle operations that return promises', async () => {
      const operation = vi.fn().mockReturnValue(Promise.resolve('success'));

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle synchronous operations', async () => {
      const operation = vi.fn().mockReturnValue('success');

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
