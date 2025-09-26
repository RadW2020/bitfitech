/**
 * @fileoverview OrderBook implementation with simple matching engine
 * @author Raul JM
 */

import { randomUUID } from 'node:crypto';

/**
 * @typedef {Object} Order
 * @property {string} id - Unique order identifier
 * @property {string} userId - User identifier
 * @property {'buy'|'sell'} side - Order side
 * @property {string} amount - Amount in string for decimal precision
 * @property {string} price - Price in string for decimal precision
 * @property {'pending'|'filled'|'cancelled'|'partial'} status - Order status
 * @property {number} timestamp - Order creation timestamp
 * @property {string} pair - Trading pair (e.g., 'BTC/USD')
 */

/**
 * @typedef {Object} Trade
 * @property {string} id - Trade identifier
 * @property {string} buyOrderId - Buy order ID
 * @property {string} sellOrderId - Sell order ID
 * @property {string} amount - Trade amount
 * @property {string} price - Trade price
 * @property {number} timestamp - Trade timestamp
 */

/**
 * @typedef {Object} MatchResult
 * @property {Trade[]} trades - Array of executed trades
 * @property {Order|null} remainingOrder - Remaining order if partially filled
 */

/**
 * OrderBook class with simple matching engine
 * Implements price-time priority matching
 */
export default class OrderBook {
  #buyOrders = new Map(); // price -> orders array (sorted by time)
  #sellOrders = new Map(); // price -> orders array (sorted by time)
  #orderMap = new Map(); // orderId -> order
  #trades = []; // executed trades
  #pair = 'BTC/USD';
  #isProcessing = false;

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
    return this.#orderMap.size;
  }

  /**
   * Get trade count
   * @returns {number} Total number of trades
   */
  get tradeCount() {
    return this.#trades.length;
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
    if (this.#isProcessing) {
      throw new Error('OrderBook is currently processing another order');
    }

    this.#isProcessing = true;

    try {
      // Validate order data
      this.#validateOrder(orderData);

      // Create order with metadata
      const order = {
        id: randomUUID(),
        timestamp: Date.now(),
        status: 'pending',
        ...orderData,
      };

      // Store order
      this.#orderMap.set(order.id, order);

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
   * Validate order data
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

    if (!amount || typeof amount !== 'string' || parseFloat(amount) <= 0) {
      throw new Error('Invalid amount. Must be a positive string number');
    }

    if (!price || typeof price !== 'string' || parseFloat(price) <= 0) {
      throw new Error('Invalid price. Must be a positive string number');
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
    let remainingAmount = parseFloat(order.amount);
    let remainingOrder = { ...order };

    const oppositeSide = order.side === 'buy' ? 'sell' : 'buy';
    const ordersToCheck = this.#getOrdersForMatching(oppositeSide, order.price, order.side);

    for (const oppositeOrder of ordersToCheck) {
      if (remainingAmount <= 0) break;

      const oppositeAmount = parseFloat(oppositeOrder.amount);
      const tradeAmount = Math.min(remainingAmount, oppositeAmount);
      const tradePrice = oppositeOrder.price; // Use opposite order price for matching

      // Create trade
      const trade = {
        id: randomUUID(),
        buyOrderId: order.side === 'buy' ? order.id : oppositeOrder.id,
        sellOrderId: order.side === 'sell' ? order.id : oppositeOrder.id,
        amount: tradeAmount.toString(),
        price: tradePrice,
        timestamp: Date.now(),
      };

      trades.push(trade);

      // Update remaining amounts
      remainingAmount -= tradeAmount;
      const oppositeRemaining = oppositeAmount - tradeAmount;

      // Update opposite order
      if (oppositeRemaining > 0) {
        oppositeOrder.amount = oppositeRemaining.toString();
        oppositeOrder.status = 'partial';
      } else {
        oppositeOrder.status = 'filled';
        this.#removeOrderFromBook(oppositeOrder);
      }
    }

    // Update remaining order
    if (remainingAmount > 0) {
      remainingOrder.amount = remainingAmount.toString();
    } else {
      remainingOrder = null;
    }

    return { trades, remainingOrder };
  }

  /**
   * Get orders for matching based on price and side
   * @param {string} side - Order side ('buy' or 'sell')
   * @param {string} price - Order price
   * @param {string} orderSide - Original order side
   * @returns {Order[]} Orders to check for matching
   * @private
   */
  #getOrdersForMatching(side, price, orderSide) {
    const orders = side === 'buy' ? this.#buyOrders : this.#sellOrders;
    const orderPrice = parseFloat(price);
    const matchingOrders = [];

    // Get all price levels
    const priceLevels = Array.from(orders.keys()).map(p => parseFloat(p));

    if (side === 'sell') {
      // For sell orders, we want prices <= order price (best prices first)
      priceLevels
        .filter(p => p <= orderPrice)
        .sort((a, b) => a - b) // Ascending price (best first)
        .forEach(priceLevel => {
          const priceOrders = orders.get(priceLevel.toString());
          if (priceOrders) {
            matchingOrders.push(...priceOrders);
          }
        });
    } else {
      // For buy orders, we want prices >= order price (best prices first)
      priceLevels
        .filter(p => p >= orderPrice)
        .sort((a, b) => b - a) // Descending price (best first)
        .forEach(priceLevel => {
          const priceOrders = orders.get(priceLevel.toString());
          if (priceOrders) {
            matchingOrders.push(...priceOrders);
          }
        });
    }

    return matchingOrders;
  }

  /**
   * Add order to the appropriate side of the orderbook
   * @param {Order} order - Order to add
   * @private
   */
  #addOrderToBook(order) {
    const orders = order.side === 'buy' ? this.#buyOrders : this.#sellOrders;
    const price = order.price;

    if (!orders.has(price)) {
      orders.set(price, []);
    }

    orders.get(price).push(order);
  }

  /**
   * Remove order from the orderbook
   * @param {Order} order - Order to remove
   * @private
   */
  #removeOrderFromBook(order) {
    const orders = order.side === 'buy' ? this.#buyOrders : this.#sellOrders;
    const price = order.price;
    const priceOrders = orders.get(price);

    if (priceOrders) {
      const index = priceOrders.findIndex(o => o.id === order.id);
      if (index !== -1) {
        priceOrders.splice(index, 1);
        if (priceOrders.length === 0) {
          orders.delete(price);
        }
      }
    }
  }

  /**
   * Get orderbook side snapshot
   * @param {string} side - Side ('buy' or 'sell')
   * @param {number} depth - Maximum depth
   * @returns {Array} Orderbook side
   * @private
   */
  #getOrderBookSide(side, depth) {
    const orders = side === 'buy' ? this.#buyOrders : this.#sellOrders;
    const result = [];

    const priceLevels = Array.from(orders.keys()).map(p => parseFloat(p));

    if (side === 'buy') {
      priceLevels
        .sort((a, b) => b - a) // Descending price for bids
        .slice(0, depth)
        .forEach(price => {
          const priceOrders = orders.get(price.toString());
          if (priceOrders) {
            const totalAmount = priceOrders.reduce(
              (sum, order) => sum + parseFloat(order.amount),
              0
            );
            result.push({
              price: price.toString(),
              amount: totalAmount.toString(),
              count: priceOrders.length,
            });
          }
        });
    } else {
      priceLevels
        .sort((a, b) => a - b) // Ascending price for asks
        .slice(0, depth)
        .forEach(price => {
          const priceOrders = orders.get(price.toString());
          if (priceOrders) {
            const totalAmount = priceOrders.reduce(
              (sum, order) => sum + parseFloat(order.amount),
              0
            );
            result.push({
              price: price.toString(),
              amount: totalAmount.toString(),
              count: priceOrders.length,
            });
          }
        });
    }

    return result;
  }
}
