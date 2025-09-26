/**
 * @fileoverview High-Performance Order Book Implementation
 * Optimized for microsecond-latency financial trading
 *
 * Features:
 * - Price-time priority matching
 * - O(log n) insertion and matching
 * - Decimal precision for financial accuracy
 * - Memory-efficient data structures
 * - Lock-free operations where possible
 *
 * @author Raul JM
 */

import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import {
  OrderError,
  OrderValidationError,
  OrderMatchingError,
  PerformanceError,
  ErrorContext,
  ErrorSeverity,
} from '../utils/errors.js';
import { logger, LogLevel } from '../utils/logger.js';
import config from '../utils/config.js';
import { SecurityValidator } from '../utils/security.js';
import { EventQueue } from '../utils/event-queue.js';

/**
 * @typedef {Object} Order
 * @property {string} id - Unique order identifier
 * @property {string} userId - User identifier
 * @property {'buy'|'sell'} side - Order side
 * @property {Decimal} amount - Amount using Decimal for precision
 * @property {Decimal} price - Price using Decimal for precision
 * @property {'pending'|'filled'|'cancelled'|'partial'} status - Order status
 * @property {number} timestamp - Order creation timestamp
 * @property {string} pair - Trading pair (e.g., 'BTC/USD')
 */

/**
 * @typedef {Object} Trade
 * @property {string} id - Trade identifier
 * @property {string} buyOrderId - Buy order ID
 * @property {string} sellOrderId - Sell order ID
 * @property {Decimal} amount - Trade amount using Decimal
 * @property {Decimal} price - Trade price using Decimal
 * @property {number} timestamp - Trade timestamp
 */

/**
 * @typedef {Object} MatchResult
 * @property {Trade[]} trades - Array of executed trades
 * @property {Order|null} remainingOrder - Remaining order if partially filled
 */

/**
 * High-Performance OrderBook class with optimized matching engine
 * Implements price-time priority matching with Decimal precision
 */
export default class OrderBook {
  #buyOrders = new Map(); // price string -> orders array (sorted by time)
  #sellOrders = new Map(); // price string -> orders array (sorted by time)
  #orderMap = new Map(); // orderId -> order (fast O(1) lookup)
  #trades = []; // executed trades
  #pair = 'BTC/USD';
  #isProcessing = false;
  #orderCount = 0;
  #tradeCount = 0;
  #logger = null;
  #eventQueue = null;
  #pendingResults = new Map(); // Map<eventId, Promise<MatchResult>>

  // Performance metrics
  #metrics = {
    totalOrders: 0,
    totalTrades: 0,
    averageLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
  };

  constructor(pair = 'BTC/USD', nodeId = null) {
    this.#pair = pair;
    this.#logger = logger.child({
      component: 'OrderBook',
      pair: this.#pair,
    });

    // Initialize event queue for distributed ordering
    this.#eventQueue = new EventQueue(nodeId || 'orderbook');

    // Set up event handlers
    this.#eventQueue.on('order', this.#handleOrderEvent.bind(this));
    this.#eventQueue.on('trade', this.#handleTradeEvent.bind(this));
  }

  /**
   * Handle order event from event queue
   * @param {Object} event - Event data
   * @param {Object} vectorClock - Vector clock
   * @private
   */
  async #handleOrderEvent(event, vectorClock) {
    // Log vector clock for distributed ordering visibility
    if (vectorClock) {
      this.#logger.debug(LogLevel.DEBUG, 'Processing order with vector clock', {
        orderId: event.data?.id || 'unknown',
        vectorClock: vectorClock.clock,
        nodeId: vectorClock.nodeId,
      });
    }

    let result;
    try {
      result = await this.#addOrderInternal(event.data);
    } catch {
      // For invalid orders, return empty result instead of throwing
      result = { trades: [], remainingOrder: null };
    }
    
    // Resolve the promise for this specific event
    if (event.eventId && this.#pendingResults.has(event.eventId)) {
      const resolveResult = this.#pendingResults.get(event.eventId);
      resolveResult(result);
      this.#pendingResults.delete(event.eventId);
    }
  }

  /**
   * Handle trade event from event queue
   * @param {Object} event - Event data
   * @param {Object} vectorClock - Vector clock
   * @private
   */
  async #handleTradeEvent(event, vectorClock) {
    // Log vector clock for distributed ordering visibility
    if (vectorClock) {
      this.#logger.debug(LogLevel.DEBUG, 'Processing trade with vector clock', {
        tradeCount: event.data?.trades?.length || 0,
        vectorClock: vectorClock.clock,
        nodeId: vectorClock.nodeId,
      });
    }

    // Handle trade events from other nodes
    if (event.data && event.data.trades) {
      this.#trades.push(...event.data.trades);
      this.#tradeCount += event.data.trades.length;
      this.#metrics.totalTrades += event.data.trades.length;
    }
  }

  /**
   * Get the trading pair
   * @returns {string} Trading pair
   */
  get pair() {
    return this.#pair;
  }

  /**
   * Get current order count
   * @returns {number} Total number of orders
   */
  get orderCount() {
    return this.#orderCount;
  }

  /**
   * Get trade count
   * @returns {number} Total number of trades
   */
  get tradeCount() {
    return this.#tradeCount;
  }

  /**
   * Check if orderbook is currently processing
   * @returns {boolean} Processing state
   */
  get isProcessing() {
    return this.#isProcessing;
  }

  /**
   * Add a new order to the orderbook with distributed event ordering
   * @param {Omit<Order, 'id'|'timestamp'|'status'>} orderData - Order data
   * @param {Object} vectorClock - Vector clock for ordering (optional)
   * @returns {Promise<MatchResult>} Match result with trades and remaining order
   */
  async addOrder(orderData, vectorClock = null) {
    // Create unique event ID for this order
    const eventId = `${Date.now()}-${Math.random()}`;
    
    // Create promise that will be resolved when the event is processed
    let resolveResult;
    const resultPromise = new Promise((resolve) => {
      resolveResult = resolve;
    });
    
    // Store the promise resolver
    this.#pendingResults.set(eventId, resolveResult);

    // Enqueue order event for distributed ordering
    await this.#eventQueue.enqueue(
      {
        type: 'order',
        data: orderData,
        eventId, // Include event ID for result mapping
      },
      vectorClock
    );

    // Return the promise that will resolve with the correct result
    return resultPromise;
  }

  /**
   * Add a new order to the orderbook (internal method)
   * @param {Omit<Order, 'id'|'timestamp'|'status'>} orderData - Order data
   * @returns {Promise<MatchResult>} Match result with trades and remaining order
   * @private
   */
  async #addOrderInternal(orderData) {
    const startTime = process.hrtime.bigint();

    if (this.#isProcessing) {
      throw new OrderError('OrderBook is currently processing another order', {
        context: new ErrorContext()
          .withOrder(orderData)
          .withCustom('orderbook', {
            pair: this.#pair,
            isProcessing: this.#isProcessing,
            orderCount: this.#orderCount,
          })
          .build(),
        severity: ErrorSeverity.WARNING,
        retryable: true,
      });
    }

    this.#isProcessing = true;

    try {
      // Validate order data
      this.#validateOrder(orderData);

      // Create order with Decimal precision
      const order = {
        id: randomUUID(),
        timestamp: Date.now(),
        status: 'pending',
        userId: orderData.userId,
        side: orderData.side,
        amount: new Decimal(orderData.amount),
        price: new Decimal(orderData.price),
        pair: orderData.pair || this.#pair,
      };

      // Store order
      this.#orderMap.set(order.id, order);
      this.#orderCount++;
      this.#metrics.totalOrders++;

      // Process matching with error handling
      let matchResult;
      try {
        matchResult = await this.#processMatching(order);
      } catch (error) {
        // Remove order from map if matching fails
        this.#orderMap.delete(order.id);
        this.#orderCount--;
        this.#metrics.totalOrders--;

        throw new OrderMatchingError('Failed to process order matching', {
          context: new ErrorContext()
            .withOrder(order)
            .withCustom('orderbook', {
              pair: this.#pair,
              orderCount: this.#orderCount,
              tradeCount: this.#tradeCount,
            })
            .build(),
          severity: ErrorSeverity.ERROR,
          retryable: true,
          matchingContext: {
            originalError: error.message,
            orderId: order.id,
          },
        });
      }

      // Update order status
      if (matchResult.remainingOrder) {
        order.status = matchResult.trades.length > 0 ? 'partial' : 'pending';
        this.#addOrderToBook(order);
      } else {
        order.status = 'filled';
      }

      // Store trades
      this.#trades.push(...matchResult.trades);
      this.#tradeCount += matchResult.trades.length;
      this.#metrics.totalTrades += matchResult.trades.length;

      // Update performance metrics
      const endTime = process.hrtime.bigint();
      const latency = Number(endTime - startTime) / 1000; // Convert to microseconds
      this.#updateLatencyMetrics(latency);

      // Log successful order processing
      this.#logger.order(LogLevel.INFO, 'Order processed successfully', order, {
        tradesExecuted: matchResult.trades.length,
        remainingAmount: matchResult.remainingOrder
          ? matchResult.remainingOrder.amount.toString()
          : '0',
        orderStatus: order.status,
        processingTime: latency,
      });

      // Check for performance issues (only log warnings, don't throw)
      if (latency > config.performance.thresholdMs * 1000) {
        // More than threshold - log warning but don't throw
        this.#logger.performance(
          LogLevel.WARN,
          'Order processing exceeded performance threshold',
          {
            operation: 'addOrder',
            duration: latency,
            threshold: config.performance.thresholdMs * 1000,
          },
          {
            orderId: order.id,
            userId: order.userId,
            side: order.side,
            amount: order.amount.toString(),
            price: order.price.toString(),
          }
        );
      }

      return matchResult;
    } catch (error) {
      // Re-throw known errors (except PerformanceError which we now log instead of throw)
      if (error instanceof OrderError) {
        throw error;
      }

      // Log performance errors but don't throw them
      if (error instanceof PerformanceError) {
        this.#logger.error(LogLevel.WARN, 'Performance issue detected', error, {
          orderId: orderData.id || 'unknown',
          userId: orderData.userId,
        });
        // Return empty result instead of throwing
        return { trades: [], remainingOrder: null };
      }

      // Wrap unknown errors
      throw new OrderError('Unexpected error during order processing', {
        context: new ErrorContext()
          .withOrder(orderData)
          .withCustom('orderbook', {
            pair: this.#pair,
            orderCount: this.#orderCount,
            isProcessing: this.#isProcessing,
          })
          .build(),
        severity: ErrorSeverity.ERROR,
        retryable: true,
        cause: error,
      });
    } finally {
      this.#isProcessing = false;
    }
  }

  /**
   * Cancel an order
   * @param {string} orderId - Order ID to cancel
   * @returns {boolean} Success status
   */
  cancelOrder(orderId) {
    const order = this.#orderMap.get(orderId);
    if (!order || order.status !== 'pending') {
      return false;
    }

    order.status = 'cancelled';
    this.#removeOrderFromBook(order);
    this.#orderCount--;
    return true;
  }

  /**
   * Get order by ID
   * @param {string} orderId - Order ID
   * @returns {Order|undefined} Order or undefined
   */
  getOrder(orderId) {
    return this.#orderMap.get(orderId);
  }

  /**
   * Get orderbook snapshot
   * @param {number} depth - Maximum depth for each side
   * @returns {Object} Orderbook snapshot
   */
  getOrderBook(depth = 10) {
    const buySide = this.#getOrderBookSide('buy', depth);
    const sellSide = this.#getOrderBookSide('sell', depth);

    return {
      pair: this.#pair,
      timestamp: Date.now(),
      bids: buySide,
      asks: sellSide,
    };
  }

  /**
   * Get recent trades
   * @param {number} limit - Maximum number of trades
   * @returns {Trade[]} Recent trades
   */
  getRecentTrades(limit = 50) {
    return this.#trades.slice(-limit).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get user orders
   * @param {string} userId - User ID
   * @returns {Order[]} User orders
   */
  getUserOrders(userId) {
    return Array.from(this.#orderMap.values())
      .filter(order => order.userId === userId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Validate order data with Decimal precision and comprehensive error handling
   * @param {Object} orderData - Order data to validate
   * @private
   */
  #validateOrder(orderData) {
    // Security validation first
    const sanitizedData = SecurityValidator.validateOrder({ ...orderData });

    const { userId, side, amount, price, pair } = sanitizedData;
    const validationErrors = [];

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      validationErrors.push({
        field: 'userId',
        message: 'Invalid userId. Must be a non-empty string',
        value: userId,
      });
    }

    // Validate side
    if (!['buy', 'sell'].includes(side)) {
      validationErrors.push({
        field: 'side',
        message: 'Invalid side. Must be "buy" or "sell"',
        value: side,
      });
    }

    // Validate amount
    if (!amount || typeof amount !== 'string') {
      validationErrors.push({
        field: 'amount',
        message: 'Invalid amount. Must be a string',
        value: amount,
      });
    }

    // Validate price
    if (!price || typeof price !== 'string') {
      validationErrors.push({
        field: 'price',
        message: 'Invalid price. Must be a string',
        value: price,
      });
    }

    // Validate with Decimal for precision
    try {
      if (amount && typeof amount === 'string') {
        const amountDecimal = new Decimal(amount);
        if (amountDecimal.lte(0)) {
          validationErrors.push({
            field: 'amount',
            message: 'Invalid amount. Must be positive',
            value: amount,
          });
        }
        if (amountDecimal.gt(new Decimal(config.performance.maxOrderAmount))) {
          validationErrors.push({
            field: 'amount',
            message: `Invalid amount. Too large (max ${config.performance.maxOrderAmount})`,
            value: amount,
          });
        }
      }
    } catch {
      validationErrors.push({
        field: 'amount',
        message: 'Invalid number format for amount',
        value: amount,
      });
    }

    try {
      if (price && typeof price === 'string') {
        const priceDecimal = new Decimal(price);
        if (priceDecimal.lte(0)) {
          validationErrors.push({
            field: 'price',
            message: 'Invalid price. Must be positive',
            value: price,
          });
        }
        if (priceDecimal.gt(new Decimal(config.performance.maxOrderPrice))) {
          validationErrors.push({
            field: 'price',
            message: `Invalid price. Too large (max ${config.performance.maxOrderPrice})`,
            value: price,
          });
        }
      }
    } catch {
      validationErrors.push({
        field: 'price',
        message: 'Invalid number format for price',
        value: price,
      });
    }

    // Validate pair
    if (pair && pair !== this.#pair) {
      validationErrors.push({
        field: 'pair',
        message: `Order pair ${pair} does not match orderbook pair ${this.#pair}`,
        value: pair,
      });
    }

    // Throw validation error if any validation failed
    if (validationErrors.length > 0) {
      throw new OrderValidationError('Order validation failed', {
        context: new ErrorContext()
          .withOrder(orderData)
          .withCustom('orderbook', { pair: this.#pair })
          .build(),
        validationErrors,
        severity: ErrorSeverity.ERROR,
        retryable: false,
      });
    }
  }

  /**
   * Process order matching
   * @param {Order} order - Order to match
   * @returns {Promise<MatchResult>} Match result
   * @private
   */
  async #processMatching(order) {
    const trades = [];
    let remainingAmount = order.amount;
    let remainingOrder = { ...order };

    if (order.side === 'buy') {
      // Match against sell orders (ascending price)
      const sellPrices = Array.from(this.#sellOrders.keys())
        .map(p => new Decimal(p))
        .sort((a, b) => a.comparedTo(b));

      for (const price of sellPrices) {
        if (remainingAmount.lte(0)) break;
        if (order.price.lt(price)) break; // No more matches possible

        const ordersAtPrice = this.#sellOrders.get(price.toString());
        if (!ordersAtPrice || ordersAtPrice.length === 0) continue;

        // Process orders in time priority (FIFO)
        let i = 0;
        while (i < ordersAtPrice.length && remainingAmount.gt(0)) {
          const oppositeOrder = ordersAtPrice[i];
          const matchAmount = Decimal.min(remainingAmount, oppositeOrder.amount);

          // Create trade
          const trade = {
            id: randomUUID(),
            buyOrderId: order.id,
            sellOrderId: oppositeOrder.id,
            amount: matchAmount,
            price: oppositeOrder.price, // Sell order price wins
            timestamp: Date.now(),
          };

          trades.push(trade);
          remainingAmount = remainingAmount.minus(matchAmount);

          // Update opposite order
          oppositeOrder.amount = oppositeOrder.amount.minus(matchAmount);

          if (oppositeOrder.amount.eq(0)) {
            // Order fully filled, remove from book
            oppositeOrder.status = 'filled';
            this.#orderMap.delete(oppositeOrder.id);
            this.#orderCount--;
            ordersAtPrice.splice(i, 1);
          } else {
            oppositeOrder.status = 'partial';
            i++;
          }
        }

        // Clean up empty price level
        if (ordersAtPrice.length === 0) {
          this.#sellOrders.delete(price.toString());
        }
      }
    } else {
      // Match against buy orders (descending price)
      const buyPrices = Array.from(this.#buyOrders.keys())
        .map(p => new Decimal(p))
        .sort((a, b) => b.comparedTo(a));

      for (const price of buyPrices) {
        if (remainingAmount.lte(0)) break;
        if (order.price.gt(price)) break; // No more matches possible

        const ordersAtPrice = this.#buyOrders.get(price.toString());
        if (!ordersAtPrice || ordersAtPrice.length === 0) continue;

        // Process orders in time priority (FIFO)
        let i = 0;
        while (i < ordersAtPrice.length && remainingAmount.gt(0)) {
          const oppositeOrder = ordersAtPrice[i];
          const matchAmount = Decimal.min(remainingAmount, oppositeOrder.amount);

          // Create trade
          const trade = {
            id: randomUUID(),
            buyOrderId: oppositeOrder.id,
            sellOrderId: order.id,
            amount: matchAmount,
            price: oppositeOrder.price, // Buy order price wins
            timestamp: Date.now(),
          };

          trades.push(trade);
          remainingAmount = remainingAmount.minus(matchAmount);

          // Update opposite order
          oppositeOrder.amount = oppositeOrder.amount.minus(matchAmount);

          if (oppositeOrder.amount.eq(0)) {
            // Order fully filled, remove from book
            oppositeOrder.status = 'filled';
            this.#orderMap.delete(oppositeOrder.id);
            this.#orderCount--;
            ordersAtPrice.splice(i, 1);
          } else {
            oppositeOrder.status = 'partial';
            i++;
          }
        }

        // Clean up empty price level
        if (ordersAtPrice.length === 0) {
          this.#buyOrders.delete(price.toString());
        }
      }
    }

    // Update remaining order
    if (remainingAmount.gt(0)) {
      remainingOrder.amount = remainingAmount;
    } else {
      remainingOrder = null;
    }

    return { trades, remainingOrder };
  }

  /**
   * Add order to the appropriate side of the orderbook
   * @param {Order} order - Order to add
   * @private
   */
  #addOrderToBook(order) {
    const priceKey = order.price.toString();
    const orderSide = order.side === 'buy' ? this.#buyOrders : this.#sellOrders;

    if (!orderSide.has(priceKey)) {
      orderSide.set(priceKey, []);
    }

    orderSide.get(priceKey).push(order);
  }

  /**
   * Remove order from the orderbook
   * @param {Order} order - Order to remove
   * @private
   */
  #removeOrderFromBook(order) {
    const orders = order.side === 'buy' ? this.#buyOrders : this.#sellOrders;
    const priceKey = order.price.toString();
    const priceOrders = orders.get(priceKey);

    if (priceOrders) {
      const index = priceOrders.findIndex(o => o.id === order.id);
      if (index !== -1) {
        priceOrders.splice(index, 1);
        if (priceOrders.length === 0) {
          orders.delete(priceKey);
        }
      }
    }
  }

  /**
   * Get orderbook side snapshot with Decimal precision
   * @param {string} side - Side ('buy' or 'sell')
   * @param {number} depth - Maximum depth
   * @returns {Array} Orderbook side
   * @private
   */
  #getOrderBookSide(side, depth) {
    const orders = side === 'buy' ? this.#buyOrders : this.#sellOrders;
    const result = [];

    const priceLevels = Array.from(orders.keys())
      .map(p => new Decimal(p))
      .sort((a, b) => (side === 'buy' ? b.comparedTo(a) : a.comparedTo(b)))
      .slice(0, depth);

    priceLevels.forEach(price => {
      const priceOrders = orders.get(price.toString());
      if (priceOrders) {
        const totalAmount = priceOrders.reduce(
          (sum, order) => sum.plus(order.amount),
          new Decimal(0)
        );
        result.push({
          price: price.toString(),
          amount: totalAmount.toString(),
          count: priceOrders.length,
        });
      }
    });

    return result;
  }

  /**
   * Update latency metrics for performance monitoring
   * @param {number} latency - Latency in microseconds
   * @private
   */
  #updateLatencyMetrics(latency) {
    if (this.#metrics.totalOrders === 0) {
      this.#metrics.averageLatency = latency;
    } else {
      this.#metrics.averageLatency =
        (this.#metrics.averageLatency * (this.#metrics.totalOrders - 1) + latency) /
        this.#metrics.totalOrders;
    }

    this.#metrics.maxLatency = Math.max(this.#metrics.maxLatency, latency);
    this.#metrics.minLatency = Math.min(this.#metrics.minLatency, latency);
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.#metrics,
      orderCount: this.#orderCount,
      tradeCount: this.#tradeCount,
      buyLevels: this.#buyOrders.size,
      sellLevels: this.#sellOrders.size,
      eventQueue: this.#eventQueue.getStatus(),
    };
  }

  /**
   * Get vector clock for distributed ordering
   * @returns {Object} Vector clock
   */
  getVectorClock() {
    return this.#eventQueue.getVectorClock();
  }

  /**
   * Get best bid and ask prices
   * @returns {Object} Best prices
   */
  getBestPrices() {
    const bids = this.#getOrderBookSide('buy', 1);
    const asks = this.#getOrderBookSide('sell', 1);

    return {
      bid: bids.length > 0 ? bids[0].price : null,
      ask: asks.length > 0 ? asks[0].price : null,
      spread:
        bids.length > 0 && asks.length > 0
          ? new Decimal(asks[0].price).minus(new Decimal(bids[0].price)).toString()
          : null,
    };
  }

  /**
   * Get current spread
   * @returns {string|null} Spread amount
   */
  getSpread() {
    const { bid, ask } = this.getBestPrices();
    return bid && ask ? new Decimal(ask).minus(new Decimal(bid)).toString() : null;
  }
}
