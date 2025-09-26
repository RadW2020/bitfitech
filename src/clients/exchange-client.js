/**
 * @fileoverview P2P Exchange Client - Main interface for the distributed exchange
 * @author Raul JM
 */

import OrderBook from '../core/orderbook.js';
import GrenacheService from '../services/grenache-service.js';
import { randomUUID } from 'node:crypto';
import config from '../utils/config.js';
import { MultiTierRateLimiter } from '../utils/rate-limiter.js';

/**
 * @typedef {Object} ExchangeConfig
 * @property {string} grapeUrl - Grenache grape URL
 * @property {string} pair - Trading pair
 * @property {string} userId - User ID for this client
 */

/**
 * @typedef {Object} OrderResult
 * @property {boolean} success - Order success
 * @property {string} orderId - Order ID
 * @property {Object[]} trades - Executed trades
 * @property {Object|null} remainingOrder - Remaining order if partially filled
 * @property {Object} distribution - Distribution result to other nodes
 */

/**
 * P2P Exchange Client
 * Main interface for interacting with the distributed exchange
 * Each client has its own orderbook and communicates with other clients via Grenache
 */
export default class ExchangeClient {
  #orderbook = null;
  #grenacheService = null;
  #config = null;
  #userId = null;
  #isInitialized = false;
  #orderHistory = new Map();
  #tradeHistory = [];
  #rateLimiter = new MultiTierRateLimiter();

  constructor(config) {
    this.#config = {
      grapeUrl: config.grenache?.url || config.grapeUrl || 'http://127.0.0.1:30001',
      pair: config.exchange?.pair || config.pair || 'BTC/USD',
      userId: config.userId || randomUUID(),
    };

    this.#userId = this.#config.userId;
    this.#orderbook = new OrderBook(this.#config.pair, this.#userId);
    this.#grenacheService = new GrenacheService(this.#config.grapeUrl);
  }

  /**
   * Get user ID
   * @returns {string} User ID
   */
  get userId() {
    return this.#userId;
  }

  /**
   * Get trading pair
   * @returns {string} Trading pair
   */
  get pair() {
    return this.#config.pair;
  }

  /**
   * Get orderbook
   * @returns {OrderBook} Orderbook instance
   */
  get orderbook() {
    return this.#orderbook;
  }

  /**
   * Get grenache service
   * @returns {GrenacheService} Grenache service instance
   */
  get grenacheService() {
    return this.#grenacheService;
  }

  /**
   * Check if client is initialized
   * @returns {boolean} Initialization status
   */
  get isInitialized() {
    return this.#isInitialized;
  }

  /**
   * Initialize the exchange client
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      return;
    }

    try {
      // Initialize Grenache service
      await this.#grenacheService.initialize();

      // Set up message handlers
      this.#setupMessageHandlers();

      // Start node synchronization
      this.#startNodeSync();

      this.#isInitialized = true;
      console.log(
        `🚀 Exchange client initialized for user ${this.#userId} on pair ${this.#config.pair}`
      );
    } catch (error) {
      console.error('❌ Failed to initialize exchange client:', error);
      throw error;
    }
  }

  /**
   * Place a buy order
   * @param {string} amount - Order amount
   * @param {string} price - Order price
   * @returns {Promise<OrderResult>} Order result
   */
  async placeBuyOrder(amount, price) {
    return await this.#placeOrder('buy', amount, price);
  }

  /**
   * Place a sell order
   * @param {string} amount - Order amount
   * @param {string} price - Order price
   * @returns {Promise<OrderResult>} Order result
   */
  async placeSellOrder(amount, price) {
    return await this.#placeOrder('sell', amount, price);
  }

  /**
   * Cancel an order
   * @param {string} orderId - Order ID to cancel
   * @returns {boolean} Success status
   */
  cancelOrder(orderId) {
    const success = this.#orderbook.cancelOrder(orderId);
    if (success) {
      console.log(`❌ Order ${orderId} cancelled`);
    }
    return success;
  }

  /**
   * Get orderbook snapshot
   * @param {number} depth - Maximum depth
   * @returns {Object} Orderbook snapshot
   */
  getOrderBook(depth = 10) {
    return this.#orderbook.getOrderBook(depth);
  }

  /**
   * Get user's orders
   * @returns {Object[]} User orders
   */
  getUserOrders() {
    return this.#orderbook.getUserOrders(this.#userId);
  }

  /**
   * Get recent trades
   * @param {number} limit - Maximum number of trades
   * @returns {Object[]} Recent trades
   */
  getRecentTrades(limit = 50) {
    return this.#orderbook.getRecentTrades(limit);
  }

  /**
   * Get order history
   * @returns {Object[]} Order history
   */
  getOrderHistory() {
    return Array.from(this.#orderHistory.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get trade history
   * @returns {Object[]} Trade history
   */
  getTradeHistory() {
    return this.#tradeHistory.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get order by ID
   * @param {string} orderId - Order ID
   * @returns {Object|undefined} Order or undefined
   */
  getOrder(orderId) {
    return this.#orderbook.getOrder(orderId);
  }

  /**
   * Place an order (internal method)
   * @param {string} side - Order side ('buy' or 'sell')
   * @param {string} amount - Order amount
   * @param {string} price - Order price
   * @returns {Promise<OrderResult>} Order result
   * @private
   */
  async #placeOrder(side, amount, price) {
    if (!this.#isInitialized) {
      throw new Error('Exchange client not initialized');
    }

    // Rate limiting
    if (!this.#rateLimiter.isAllowed(this.#userId, 'orders')) {
      throw new Error('Rate limit exceeded: too many orders');
    }

    try {
      // Create order data
      const orderData = {
        userId: this.#userId,
        side,
        amount,
        price,
        pair: this.#config.pair,
      };

      console.log(`📝 Placing ${side} order: ${amount} @ ${price}`);

      // Add order to local orderbook
      const matchResult = await this.#orderbook.addOrder(orderData);
      const order = this.#orderbook.getOrder(
        matchResult.remainingOrder?.id ||
          matchResult.trades[0]?.buyOrderId ||
          matchResult.trades[0]?.sellOrderId
      );

      // Store order in history
      if (order) {
        this.#orderHistory.set(order.id, {
          ...order,
          localTrades: matchResult.trades,
          timestamp: Date.now(),
        });
      }

      // Store trades in history
      this.#tradeHistory.push(...matchResult.trades);

      // Distribute order to other nodes
      let distribution = { success: false, distributedTo: [], failedTo: [] };
      if (order) {
        try {
          distribution = await this.#grenacheService.distributeOrder(order);
          console.log(`📡 Order distributed to ${distribution.distributedTo.length} nodes`);
        } catch (error) {
          console.error('❌ Failed to distribute order:', error);
        }
      }

      // Broadcast trades to other nodes
      for (const trade of matchResult.trades) {
        try {
          await this.#grenacheService.broadcastTrade(trade);
        } catch (error) {
          console.error('❌ Failed to broadcast trade:', error);
        }
      }

      return {
        success: true,
        orderId: order?.id,
        trades: matchResult.trades,
        remainingOrder: matchResult.remainingOrder,
        distribution,
      };
    } catch (error) {
      console.error('❌ Failed to place order:', error);
      return {
        success: false,
        orderId: null,
        trades: [],
        remainingOrder: null,
        distribution: { success: false, distributedTo: [], failedTo: [] },
        error: error.message,
      };
    }
  }

  /**
   * Set up message handlers for Grenache communication
   * @private
   */
  #setupMessageHandlers() {
    // Handle incoming orders from other nodes
    this.#grenacheService.addOrderHandler(async (order, vectorClock) => {
      try {
        console.log(`📨 Processing order from other node: ${order.id}`);

        // Add order to local orderbook with vector clock
        const matchResult = await this.#orderbook.addOrder(order, vectorClock);

        // Store order in history
        if (matchResult.remainingOrder) {
          this.#orderHistory.set(matchResult.remainingOrder.id, {
            ...matchResult.remainingOrder,
            localTrades: matchResult.trades,
            timestamp: Date.now(),
          });
        }

        // Store trades in history
        this.#tradeHistory.push(...matchResult.trades);

        // Broadcast trades to other nodes
        for (const trade of matchResult.trades) {
          try {
            await this.#grenacheService.broadcastTrade(trade);
          } catch (error) {
            console.error('❌ Failed to broadcast trade:', error);
          }
        }

        console.log(`✅ Processed order ${order.id} with ${matchResult.trades.length} trades`);
      } catch (error) {
        console.error('❌ Error processing order from other node:', error);
      }
    });

    // Handle incoming trades from other nodes
    this.#grenacheService.addTradeHandler((trade, vectorClock) => {
      try {
        console.log(`💰 Received trade from other node: ${trade.id}`);
        this.#tradeHistory.push(trade);
      } catch (error) {
        console.error('❌ Error processing trade from other node:', error);
      }
    });

    // Handle orderbook sync from other nodes
    this.#grenacheService.addOrderbookHandler((orderbook, vectorClock) => {
      try {
        console.log(`📊 Received orderbook sync from other node`);
        // In a more sophisticated implementation, we might merge orderbooks
        // For now, we just log the sync
      } catch (error) {
        console.error('❌ Error processing orderbook sync:', error);
      }
    });
  }

  /**
   * Start node synchronization
   * @private
   */
  #startNodeSync() {
    // Get current node state
    const getNodeState = () => ({
      nodeId: this.#userId,
      orderbook: this.#orderbook.getMetrics(),
      vectorClock: this.#grenacheService.getVectorClock(),
      timestamp: Date.now(),
      version: 1,
    });

    // Get active nodes (simplified - in real implementation, this would query the DHT)
    const getActiveNodes = () => {
      // For now, return empty array - in real implementation, this would query Grenache DHT
      return [];
    };

    // Start synchronization
    this.#grenacheService.startNodeSync(getNodeState, getActiveNodes);
  }

  /**
   * Destroy the exchange client
   */
  destroy() {
    if (this.#grenacheService) {
      this.#grenacheService.destroy();
    }
    this.#isInitialized = false;
    console.log('🛑 Exchange client destroyed');
  }
}
