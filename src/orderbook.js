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

  // Performance metrics
  #metrics = {
    totalOrders: 0,
    totalTrades: 0,
    averageLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
  };

  constructor(pair = 'BTC/USD') {
    this.#pair = pair;
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
   * Add a new order to the orderbook
   * @param {Omit<Order, 'id'|'timestamp'|'status'>} orderData - Order data
   * @returns {Promise<MatchResult>} Match result with trades and remaining order
   */
  async addOrder(orderData) {
    const startTime = process.hrtime.bigint();

    if (this.#isProcessing) {
      throw new Error('OrderBook is currently processing another order');
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

      // Process matching
      const matchResult = await this.#processMatching(order);

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

      return matchResult;
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
   * Validate order data with Decimal precision
   * @param {Object} orderData - Order data to validate
   * @private
   */
  #validateOrder(orderData) {
    const { userId, side, amount, price, pair } = orderData;

    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId');
    }

    if (!['buy', 'sell'].includes(side)) {
      throw new Error('Invalid side. Must be "buy" or "sell"');
    }

    if (!amount || typeof amount !== 'string') {
      throw new Error('Invalid amount. Must be a string');
    }

    if (!price || typeof price !== 'string') {
      throw new Error('Invalid price. Must be a string');
    }

    // Validate with Decimal for precision
    try {
      const amountDecimal = new Decimal(amount);
      const priceDecimal = new Decimal(price);

      if (amountDecimal.lte(0)) {
        throw new Error('Invalid amount. Must be positive');
      }

      if (priceDecimal.lte(0)) {
        throw new Error('Invalid price. Must be positive');
      }
    } catch (error) {
      if (error.message.includes('Invalid')) {
        throw error;
      }
      throw new Error('Invalid number format for amount or price');
    }

    if (pair && pair !== this.#pair) {
      throw new Error(`Order pair ${pair} does not match orderbook pair ${this.#pair}`);
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
    this.#metrics.averageLatency =
      (this.#metrics.averageLatency * (this.#metrics.totalOrders - 1) + latency) /
      this.#metrics.totalOrders;

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
    };
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
