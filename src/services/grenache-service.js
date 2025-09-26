/**
 * @fileoverview Grenache P2P communication service for distributed exchange
 * @author Raul JM
 */

import { PeerRPCServer, PeerRPCClient } from 'grenache-nodejs-http';
import Link from 'grenache-nodejs-link';
import { randomUUID } from 'node:crypto';
import CircuitBreaker from '../utils/circuit-breaker.js';
import {
  NetworkError,
  GrenacheServiceError,
  CircuitBreakerError,
  ErrorContext,
  ErrorSeverity,
} from '../utils/errors.js';
import { logger, LogLevel } from '../utils/logger.js';
import config from '../utils/config.js';
import { VectorClock } from '../utils/vector-clock.js';
import { NodeSync } from '../utils/node-sync.js';

/**
 * @typedef {Object} OrderMessage
 * @property {string} id - Message ID
 * @property {string} type - Message type ('order', 'orderbook_sync', 'trade')
 * @property {string} fromNode - Source node ID
 * @property {Object} payload - Message payload
 * @property {Object} vectorClock - Vector clock for distributed ordering
 * @property {number} timestamp - Message timestamp
 */

/**
 * @typedef {Object} OrderDistributionResult
 * @property {boolean} success - Distribution success
 * @property {string[]} distributedTo - Node IDs that received the order
 * @property {string[]} failedTo - Node IDs that failed to receive the order
 */

/**
 * Grenache service for P2P communication between exchange nodes
 * Handles order distribution, orderbook synchronization, and trade broadcasting
 */
export default class GrenacheService {
  #link = null;
  #server = null;
  #client = null;
  #nodeId = null;
  #serviceName = 'p2p_exchange';
  #port = null;
  #isInitialized = false;
  #orderHandlers = new Set();
  #orderbookHandlers = new Set();
  #tradeHandlers = new Set();
  #circuitBreaker = null;
  #logger = null;
  #vectorClock = null;
  #nodeSync = null;

  constructor(grapeUrl = null) {
    this.#nodeId = randomUUID();
    this.#link = new Link({ grape: grapeUrl || config.grenache.url });

    // Initialize logger
    this.#logger = logger.child({
      component: 'GrenacheService',
      nodeId: this.#nodeId.slice(0, 8),
    });

    // Initialize circuit breaker for network operations
    this.#circuitBreaker = new CircuitBreaker({
      name: `grenache-${this.#nodeId.slice(0, 8)}`,
      failureThreshold: config.circuitBreaker.failureThreshold,
      resetTimeout: config.circuitBreaker.resetTimeoutMs,
    });

    // Initialize vector clock for distributed ordering
    this.#vectorClock = new VectorClock(this.#nodeId);

    // Initialize node synchronization
    this.#nodeSync = new NodeSync(this.#nodeId);
  }

  /**
   * Get node ID
   * @returns {string} Node ID
   */
  get nodeId() {
    return this.#nodeId;
  }

  /**
   * Get service name
   * @returns {string} Service name
   */
  get serviceName() {
    return this.#serviceName;
  }

  /**
   * Check if service is initialized
   * @returns {boolean} Initialization status
   */
  get isInitialized() {
    return this.#isInitialized;
  }

  /**
   * Initialize the Grenache service
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      return;
    }

    try {
      // Start link
      this.#link.start();

      // Initialize server
      this.#server = new PeerRPCServer(this.#link, {
        timeout: 300000,
      });
      this.#server.init();

      // Initialize client
      this.#client = new PeerRPCClient(this.#link, {});
      this.#client.init();

      // Start server on random port
      this.#port = 1024 + Math.floor(Math.random() * 1000);
      const service = this.#server.transport('server');
      service.listen(this.#port);

      // Announce service
      setInterval(() => {
        this.#link.announce(this.#serviceName, this.#port, {
          nodeId: this.#nodeId,
          timestamp: Date.now(),
        });
      }, 1000);

      // Handle incoming requests
      service.on('request', (rid, key, payload, handler) => {
        this.#handleRequest(rid, key, payload, handler);
      });

      this.#isInitialized = true;
      this.#logger.system(LogLevel.INFO, 'Grenache service initialized', {
        port: this.#port,
        nodeId: this.#nodeId,
        serviceName: this.#serviceName,
      });
    } catch (error) {
      this.#logger.error(LogLevel.ERROR, 'Failed to initialize Grenache service', error, {
        port: this.#port,
        nodeId: this.#nodeId,
      });
      throw error;
    }
  }

  /**
   * Add order handler
   * @param {Function} handler - Order handler function
   */
  addOrderHandler(handler) {
    this.#orderHandlers.add(handler);
  }

  /**
   * Remove order handler
   * @param {Function} handler - Order handler function
   */
  removeOrderHandler(handler) {
    this.#orderHandlers.delete(handler);
  }

  /**
   * Add orderbook handler
   * @param {Function} handler - Orderbook handler function
   */
  addOrderbookHandler(handler) {
    this.#orderbookHandlers.add(handler);
  }

  /**
   * Remove orderbook handler
   * @param {Function} handler - Orderbook handler function
   */
  removeOrderbookHandler(handler) {
    this.#orderbookHandlers.delete(handler);
  }

  /**
   * Add trade handler
   * @param {Function} handler - Trade handler function
   */
  addTradeHandler(handler) {
    this.#tradeHandlers.add(handler);
  }

  /**
   * Remove trade handler
   * @param {Function} handler - Trade handler function
   */
  removeTradeHandler(handler) {
    this.#tradeHandlers.delete(handler);
  }

  /**
   * Distribute order to other nodes with circuit breaker protection
   * @param {Object} order - Order to distribute
   * @returns {Promise<OrderDistributionResult>} Distribution result
   */
  async distributeOrder(order) {
    if (!this.#isInitialized) {
      throw new GrenacheServiceError('Grenache service not initialized', {
        context: new ErrorContext().withOrder(order).withNetwork({ nodeId: this.#nodeId }).build(),
        serviceName: this.#serviceName,
        operation: 'distributeOrder',
        severity: ErrorSeverity.ERROR,
        retryable: false,
      });
    }

    // Update vector clock for this event
    this.#vectorClock.tick();

    const message = {
      id: randomUUID(),
      type: 'order',
      fromNode: this.#nodeId,
      payload: order,
      vectorClock: this.#vectorClock.toObject(),
      timestamp: Date.now(),
    };

    try {
      const result = await this.#circuitBreaker.execute(async () => {
        return await this.#sendToAllNodes(message);
      });

      // Log successful distribution
      this.#logger.network(
        LogLevel.INFO,
        'Order distributed successfully',
        {
          nodeId: this.#nodeId,
          operation: 'distributeOrder',
        },
        {
          orderId: order.id,
          distributedTo: result.successfulNodes,
          failedTo: result.failedNodes,
          totalNodes: result.successfulNodes.length + result.failedNodes.length,
        }
      );

      return {
        success: result.success,
        distributedTo: result.successfulNodes,
        failedTo: result.failedNodes,
      };
    } catch (error) {
      // Handle circuit breaker errors
      if (error.message.includes('Circuit breaker')) {
        throw new CircuitBreakerError('Circuit breaker is open for order distribution', {
          context: new ErrorContext()
            .withOrder(order)
            .withNetwork({ nodeId: this.#nodeId })
            .build(),
          breakerName: this.#circuitBreaker.name,
          state: this.#circuitBreaker.state,
          failureCount: this.#circuitBreaker.failureCount,
          severity: ErrorSeverity.WARNING,
          retryable: false,
        });
      }

      // Handle network errors
      if (error instanceof NetworkError) {
        throw new GrenacheServiceError('Network error during order distribution', {
          context: new ErrorContext()
            .withOrder(order)
            .withNetwork({ nodeId: this.#nodeId })
            .build(),
          serviceName: this.#serviceName,
          operation: 'distributeOrder',
          severity: ErrorSeverity.ERROR,
          retryable: true,
          cause: error,
        });
      }

      // Handle other errors
      throw new GrenacheServiceError('Failed to distribute order', {
        context: new ErrorContext().withOrder(order).withNetwork({ nodeId: this.#nodeId }).build(),
        serviceName: this.#serviceName,
        operation: 'distributeOrder',
        severity: ErrorSeverity.ERROR,
        retryable: true,
        cause: error,
      });
    }
  }

  /**
   * Broadcast trade to other nodes with circuit breaker protection
   * @param {Object} trade - Trade to broadcast
   * @returns {Promise<boolean>} Broadcast success
   */
  async broadcastTrade(trade) {
    if (!this.#isInitialized) {
      throw new Error('Grenache service not initialized');
    }

    // Update vector clock for this event
    this.#vectorClock.tick();

    const message = {
      id: randomUUID(),
      type: 'trade',
      fromNode: this.#nodeId,
      payload: trade,
      vectorClock: this.#vectorClock.toObject(),
      timestamp: Date.now(),
    };

    try {
      const result = await this.#circuitBreaker.execute(async () => {
        return await this.#sendToAllNodes(message);
      });
      return result.success;
    } catch (error) {
      this.#logger.error(LogLevel.ERROR, 'Failed to broadcast trade', error, {
        tradeId: trade.id,
        nodeId: this.#nodeId,
      });
      return false;
    }
  }

  /**
   * Sync orderbook with other nodes with circuit breaker protection
   * @param {Object} orderbook - Orderbook snapshot
   * @returns {Promise<boolean>} Sync success
   */
  async syncOrderbook(orderbook) {
    if (!this.#isInitialized) {
      throw new Error('Grenache service not initialized');
    }

    // Update vector clock for this event
    this.#vectorClock.tick();

    const message = {
      id: randomUUID(),
      type: 'orderbook_sync',
      fromNode: this.#nodeId,
      payload: orderbook,
      vectorClock: this.#vectorClock.toObject(),
      timestamp: Date.now(),
    };

    try {
      const result = await this.#circuitBreaker.execute(async () => {
        return await this.#sendToAllNodes(message);
      });
      return result.success;
    } catch (error) {
      this.#logger.error(LogLevel.ERROR, 'Failed to sync orderbook', error, {
        orderbookPair: orderbook.pair,
        nodeId: this.#nodeId,
      });
      return false;
    }
  }

  /**
   * Send message to all available nodes
   * @param {OrderMessage} message - Message to send
   * @returns {Promise<Object>} Send result
   * @private
   */
  async #sendToAllNodes(message) {
    return new Promise(resolve => {
      const timeout = 5000; // 5 second timeout
      let completed = 0;
      let totalNodes = 0;
      const successfulNodes = [];
      const failedNodes = [];

      // Use map to send to all available nodes
      this.#client.map(this.#serviceName, message, { timeout, limit: 10 }, (err, data) => {
        completed++;

        if (err) {
          console.warn('⚠️ Failed to send message to node:', err.message);
          failedNodes.push('unknown');
        } else {
          successfulNodes.push(data?.nodeId || 'unknown');
        }

        // Resolve when all requests are completed or timeout
        if (completed >= totalNodes) {
          resolve({
            success: successfulNodes.length > 0,
            successfulNodes,
            failedNodes,
          });
        }
      });

      // Set total nodes (this is an approximation)
      totalNodes = Math.max(1, completed);
    });
  }

  /**
   * Handle incoming requests
   * @param {string} rid - Request ID
   * @param {string} key - Service key
   * @param {OrderMessage} payload - Request payload
   * @param {Object} handler - Response handler
   * @private
   */
  #handleRequest(rid, key, payload, handler) {
    try {
      // Ignore messages from self
      if (payload.fromNode === this.#nodeId) {
        handler.reply(null, { success: true, message: 'Ignored self message' });
        return;
      }

      // Update vector clock with incoming message
      if (payload.vectorClock) {
        const incomingClock = VectorClock.fromObject(payload.fromNode, payload.vectorClock);
        this.#vectorClock.update(incomingClock);
      }

      // Route message to appropriate handlers
      switch (payload.type) {
      case 'order':
        this.#handleOrderMessage(payload);
        break;
      case 'trade':
        this.#handleTradeMessage(payload);
        break;
      case 'orderbook_sync':
        this.#handleOrderbookMessage(payload);
        break;
      case 'sync_request':
        this.#handleSyncRequest(payload, handler);
        break;
      default:
        console.warn(`⚠️ Unknown message type: ${payload.type}`);
      }

      handler.reply(null, {
        success: true,
        nodeId: this.#nodeId,
        message: 'Message processed',
      });
    } catch (error) {
      console.error('❌ Error handling request:', error);
      handler.reply(error, null);
    }
  }

  /**
   * Handle order message
   * @param {OrderMessage} message - Order message
   * @private
   */
  #handleOrderMessage(message) {
    console.log(`📨 Received order from node ${message.fromNode}:`, message.payload.id);

    // Create vector clock from message
    const vectorClock = message.vectorClock
      ? VectorClock.fromObject(message.fromNode, message.vectorClock)
      : null;

    // Notify all order handlers with vector clock
    this.#orderHandlers.forEach(handler => {
      try {
        handler(message.payload, vectorClock);
      } catch (error) {
        console.error('❌ Error in order handler:', error);
      }
    });
  }

  /**
   * Handle trade message
   * @param {OrderMessage} message - Trade message
   * @private
   */
  #handleTradeMessage(message) {
    console.log(`💰 Received trade from node ${message.fromNode}:`, message.payload.id);

    // Create vector clock from message
    const vectorClock = message.vectorClock
      ? VectorClock.fromObject(message.fromNode, message.vectorClock)
      : null;

    // Notify all trade handlers with vector clock
    this.#tradeHandlers.forEach(handler => {
      try {
        handler(message.payload, vectorClock);
      } catch (error) {
        console.error('❌ Error in trade handler:', error);
      }
    });
  }

  /**
   * Handle orderbook message
   * @param {OrderMessage} message - Orderbook message
   * @private
   */
  #handleOrderbookMessage(message) {
    console.log(`📊 Received orderbook sync from node ${message.fromNode}`);

    // Create vector clock from message
    const vectorClock = message.vectorClock
      ? VectorClock.fromObject(message.fromNode, message.vectorClock)
      : null;

    // Notify all orderbook handlers with vector clock
    this.#orderbookHandlers.forEach(handler => {
      try {
        handler(message.payload, vectorClock);
      } catch (error) {
        console.error('❌ Error in orderbook handler:', error);
      }
    });
  }

  /**
   * Get circuit breaker status
   * @returns {Object} Circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.#circuitBreaker.getStatus();
  }

  /**
   * Get current vector clock
   * @returns {Object} Vector clock
   */
  getVectorClock() {
    return this.#vectorClock.toObject();
  }

  /**
   * Start node synchronization
   * @param {Function} getNodeState - Function to get current node state
   * @param {Function} getActiveNodes - Function to get active nodes
   */
  startNodeSync(getNodeState, getActiveNodes) {
    this.#nodeSync.startPeriodicSync(
      getNodeState,
      getActiveNodes,
      this.#sendSyncRequest.bind(this)
    );
  }

  /**
   * Send sync request to a specific node
   * @param {string} nodeId - Target node ID
   * @param {Object} currentNodeState - Current node state
   * @returns {Promise<Object>} Remote node state
   * @private
   */
  async #sendSyncRequest(nodeId, currentNodeState) {
    try {
      const message = {
        id: randomUUID(),
        type: 'sync_request',
        fromNode: this.#nodeId,
        payload: currentNodeState,
        vectorClock: this.#vectorClock.toObject(),
        timestamp: Date.now(),
      };

      // Use sendToAllNodes for now - in a real implementation, this would send to a specific node
      const result = await this.#sendToAllNodes(message);
      return result;
    } catch (error) {
      this.#logger.error(LogLevel.ERROR, `Sync request to ${nodeId} failed`, error);
      throw error;
    }
  }

  /**
   * Get node synchronization status
   * @returns {Object} Sync status
   */
  getNodeSyncStatus() {
    return this.#nodeSync.getStatus();
  }

  /**
   * Handle sync request
   * @param {OrderMessage} message - Sync request message
   * @param {Object} handler - Response handler
   * @private
   */
  #handleSyncRequest(message, handler) {
    try {
      console.log(`🔄 Received sync request from node ${message.fromNode}`);

      // Get current node state
      const currentNodeState = {
        nodeId: this.#nodeId,
        orderbook: this.#getCurrentOrderbookState(),
        vectorClock: this.#vectorClock.toObject(),
        timestamp: Date.now(),
        version: 1,
      };

      // Send response with current state
      handler.reply(null, {
        success: true,
        nodeId: this.#nodeId,
        state: currentNodeState,
        message: 'Sync response',
      });
    } catch (error) {
      console.error('❌ Error handling sync request:', error);
      handler.reply(new Error('Failed to handle sync request'), null);
    }
  }

  /**
   * Get current orderbook state
   * @returns {Object} Orderbook state
   * @private
   */
  #getCurrentOrderbookState() {
    // This would be implemented by the ExchangeClient
    // For now, return a placeholder
    return {
      orderCount: 0,
      tradeCount: 0,
      orders: [],
      trades: [],
    };
  }

  /**
   * Get circuit breaker metrics
   * @returns {Object} Circuit breaker metrics
   */
  getCircuitBreakerMetrics() {
    return this.#circuitBreaker.getMetrics();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.#circuitBreaker.reset();
  }

  /**
   * Destroy the service
   */
  destroy() {
    if (this.#link) {
      this.#link.stop();
    }
    this.#isInitialized = false;
    this.#logger.system(LogLevel.INFO, 'Grenache service destroyed', {
      nodeId: this.#nodeId,
      port: this.#port,
    });
  }
}
