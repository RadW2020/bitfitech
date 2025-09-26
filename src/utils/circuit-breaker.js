/**
 * @fileoverview Circuit Breaker Pattern Implementation
 * Prevents cascade failures in distributed trading systems
 *
 * States:
 * - CLOSED: Normal operation
 * - OPEN: Failing fast, not executing operations
 * - HALF_OPEN: Testing if service recovered
 *
 * @author Raul JM
 */

/**
 * Enterprise Circuit Breaker for financial systems
 * Protects against cascade failures in P2P trading networks
 */
export default class CircuitBreaker {
  #failureThreshold;
  #resetTimeout;
  #name;
  #state;
  #failureCount;
  #lastFailureTime;
  #successCount;
  #metrics;

  static STATES = {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
  };

  /**
   * Initialize Circuit Breaker with configurable thresholds
   * @param {Object} options - Configuration options
   * @param {number} options.failureThreshold - Number of failures before opening circuit
   * @param {number} options.resetTimeout - Time in ms before attempting reset
   * @param {string} options.name - Circuit breaker identifier
   */
  constructor(options = {}) {
    this.#failureThreshold = options.failureThreshold || 5;
    this.#resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.#name = options.name || 'circuit-breaker';

    this.#state = CircuitBreaker.STATES.CLOSED;
    this.#failureCount = 0;
    this.#lastFailureTime = null;
    this.#successCount = 0;

    // Metrics for monitoring
    this.#metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      stateTransitions: 0,
      lastStateChange: Date.now(),
    };
  }

  /**
   * Execute operation with circuit breaker protection
   * @param {Function} operation - Async operation to execute
   * @returns {Promise<any>} Operation result
   * @throws {Error} Circuit breaker error or operation error
   */
  async execute(operation) {
    this.#metrics.totalRequests++;

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.#state === CircuitBreaker.STATES.OPEN) {
      if (this.#shouldAttemptReset()) {
        this.#transitionToState(CircuitBreaker.STATES.HALF_OPEN);
        this.#successCount = 0;
      } else {
        this.#metrics.totalFailures++;
        throw new Error(`Circuit breaker ${this.#name} is OPEN - failing fast`);
      }
    }

    try {
      const result = await operation();
      this.#onSuccess();
      return result;
    } catch (error) {
      this.#onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   * @private
   */
  #onSuccess() {
    this.#metrics.totalSuccesses++;
    this.#failureCount = 0;

    if (this.#state === CircuitBreaker.STATES.HALF_OPEN) {
      this.#successCount++;

      // If enough successes in HALF_OPEN, close the circuit
      if (this.#successCount >= Math.ceil(this.#failureThreshold / 2)) {
        this.#transitionToState(CircuitBreaker.STATES.CLOSED);
        this.#successCount = 0;
      }
    }
  }

  /**
   * Handle failed operation
   * @private
   */
  #onFailure() {
    this.#metrics.totalFailures++;
    this.#failureCount++;
    this.#lastFailureTime = Date.now();

    // Open circuit if failure threshold reached
    if (this.#failureCount >= this.#failureThreshold) {
      this.#transitionToState(CircuitBreaker.STATES.OPEN);
    }

    // If in HALF_OPEN and still failing, go back to OPEN
    if (this.#state === CircuitBreaker.STATES.HALF_OPEN) {
      this.#transitionToState(CircuitBreaker.STATES.OPEN);
      this.#successCount = 0;
    }
  }

  /**
   * Transition to new state and update metrics
   * @param {string} newState - New state to transition to
   * @private
   */
  #transitionToState(newState) {
    if (this.#state !== newState) {
      this.#state = newState;
      this.#metrics.stateTransitions++;
      this.#metrics.lastStateChange = Date.now();
    }
  }

  /**
   * Check if circuit should attempt reset
   * @returns {boolean} Should attempt reset
   * @private
   */
  #shouldAttemptReset() {
    return this.#lastFailureTime && Date.now() - this.#lastFailureTime > this.#resetTimeout;
  }

  /**
   * Get current circuit breaker status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      name: this.#name,
      state: this.#state,
      failureCount: this.#failureCount,
      failureThreshold: this.#failureThreshold,
      lastFailureTime: this.#lastFailureTime,
      resetTimeout: this.#resetTimeout,
      nextRetryTime: this.#lastFailureTime ? this.#lastFailureTime + this.#resetTimeout : null,
      successCount: this.#successCount,
      metrics: { ...this.#metrics },
    };
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    const successRate =
      this.#metrics.totalRequests > 0
        ? (this.#metrics.totalSuccesses / this.#metrics.totalRequests) * 100
        : 0;

    const failureRate =
      this.#metrics.totalRequests > 0
        ? (this.#metrics.totalFailures / this.#metrics.totalRequests) * 100
        : 0;

    return {
      ...this.#metrics,
      successRate: Math.round(successRate * 100) / 100,
      failureRate: Math.round(failureRate * 100) / 100,
      uptime: Date.now() - this.#metrics.lastStateChange,
    };
  }

  /**
   * Force reset circuit breaker to CLOSED state
   */
  reset() {
    this.#transitionToState(CircuitBreaker.STATES.CLOSED);
    this.#failureCount = 0;
    this.#lastFailureTime = null;
    this.#successCount = 0;
  }

  /**
   * Check if circuit is open
   * @returns {boolean} Is circuit open
   */
  isOpen() {
    return this.#state === CircuitBreaker.STATES.OPEN;
  }

  /**
   * Check if circuit is closed
   * @returns {boolean} Is circuit closed
   */
  isClosed() {
    return this.#state === CircuitBreaker.STATES.CLOSED;
  }

  /**
   * Check if circuit is half-open
   * @returns {boolean} Is circuit half-open
   */
  isHalfOpen() {
    return this.#state === CircuitBreaker.STATES.HALF_OPEN;
  }

  /**
   * Get circuit breaker name
   * @returns {string} Circuit breaker name
   */
  get name() {
    return this.#name;
  }

  /**
   * Get current state
   * @returns {string} Current state
   */
  get state() {
    return this.#state;
  }

  /**
   * Get failure count
   * @returns {number} Current failure count
   */
  get failureCount() {
    return this.#failureCount;
  }
}
