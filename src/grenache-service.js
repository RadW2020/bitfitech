/**
 * @fileoverview Grenache P2P communication service for distributed exchange
 * @author Raul JM
 */

import { PeerRPCServer, PeerRPCClient } from 'grenache-nodejs-http';
import Link from 'grenache-nodejs-link';
import { randomUUID } from 'node:crypto';

/**
 * @typedef {Object} OrderMessage
 * @property {string} id - Message ID
 * @property {string} type - Message type ('order', 'orderbook_sync', 'trade')
 * @property {string} fromNode - Source node ID
 * @property {Object} payload - Message payload
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

  constructor(grapeUrl = 'http://127.0.0.1:30001') {
    this.#nodeId = randomUUID();
    this.#link = new Link({ grape: grapeUrl });
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
      console.log(
        `🚀 Grenache service initialized on port ${this.#port} with node ID: ${this.#nodeId}`
      );
    } catch (error) {
      console.error('❌ Failed to initialize Grenache service:', error);
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
   * Distribute order to other nodes
   * @param {Object} order - Order to distribute
   * @returns {Promise<OrderDistributionResult>} Distribution result
   */
  async distributeOrder(order) {
    if (!this.#isInitialized) {
      throw new Error('Grenache service not initialized');
    }

    const message = {
      id: randomUUID(),
      type: 'order',
      fromNode: this.#nodeId,
      payload: order,
      timestamp: Date.now(),
    };

    try {
      const result = await this.#sendToAllNodes(message);
      return {
        success: result.success,
        distributedTo: result.successfulNodes,
        failedTo: result.failedNodes,
      };
    } catch (error) {
      console.error('❌ Failed to distribute order:', error);
      return {
        success: false,
        distributedTo: [],
        failedTo: ['all'],
      };
    }
  }

  /**
   * Broadcast trade to other nodes
   * @param {Object} trade - Trade to broadcast
   * @returns {Promise<boolean>} Broadcast success
   */
  async broadcastTrade(trade) {
    if (!this.#isInitialized) {
      throw new Error('Grenache service not initialized');
    }

    const message = {
      id: randomUUID(),
      type: 'trade',
      fromNode: this.#nodeId,
      payload: trade,
      timestamp: Date.now(),
    };

    try {
      const result = await this.#sendToAllNodes(message);
      return result.success;
    } catch (error) {
      console.error('❌ Failed to broadcast trade:', error);
      return false;
    }
  }

  /**
   * Sync orderbook with other nodes
   * @param {Object} orderbook - Orderbook snapshot
   * @returns {Promise<boolean>} Sync success
   */
  async syncOrderbook(orderbook) {
    if (!this.#isInitialized) {
      throw new Error('Grenache service not initialized');
    }

    const message = {
      id: randomUUID(),
      type: 'orderbook_sync',
      fromNode: this.#nodeId,
      payload: orderbook,
      timestamp: Date.now(),
    };

    try {
      const result = await this.#sendToAllNodes(message);
      return result.success;
    } catch (error) {
      console.error('❌ Failed to sync orderbook:', error);
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
          console.warn(`⚠️ Failed to send message to node:`, err.message);
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

    // Notify all order handlers
    this.#orderHandlers.forEach(handler => {
      try {
        handler(message.payload);
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

    // Notify all trade handlers
    this.#tradeHandlers.forEach(handler => {
      try {
        handler(message.payload);
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

    // Notify all orderbook handlers
    this.#orderbookHandlers.forEach(handler => {
      try {
        handler(message.payload);
      } catch (error) {
        console.error('❌ Error in orderbook handler:', error);
      }
    });
  }

  /**
   * Destroy the service
   */
  destroy() {
    if (this.#link) {
      this.#link.stop();
    }
    this.#isInitialized = false;
    console.log('🛑 Grenache service destroyed');
  }
}
