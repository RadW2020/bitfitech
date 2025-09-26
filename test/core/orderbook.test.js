/**
 * @fileoverview Unit tests for OrderBook class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import OrderBook from '../../src/core/orderbook.js';

describe('OrderBook', () => {
  let orderbook;

  beforeEach(() => {
    orderbook = new OrderBook('BTC/USD');
  });

  describe('Constructor', () => {
    it('should create orderbook with default pair', () => {
      const defaultOrderbook = new OrderBook();
      expect(defaultOrderbook.pair).toBe('BTC/USD');
    });

    it('should create orderbook with custom pair', () => {
      const customOrderbook = new OrderBook('ETH/USD');
      expect(customOrderbook.pair).toBe('ETH/USD');
    });

    it('should initialize with empty state', () => {
      expect(orderbook.orderCount).toBe(0);
      expect(orderbook.tradeCount).toBe(0);
      expect(orderbook.isProcessing).toBe(false);
    });
  });

  describe('Order Validation', () => {
    it('should reject order with invalid userId', async () => {
      const invalidOrder = {
        userId: '',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      await expect(orderbook.addOrder(invalidOrder)).rejects.toThrow('Invalid userId');
    });

    it('should reject order with invalid side', async () => {
      const invalidOrder = {
        userId: 'user1',
        side: 'invalid',
        amount: '1.0',
        price: '50000',
      };

      await expect(orderbook.addOrder(invalidOrder)).rejects.toThrow('Invalid side');
    });

    it('should reject order with invalid amount', async () => {
      const invalidOrder = {
        userId: 'user1',
        side: 'buy',
        amount: '0',
        price: '50000',
      };

      await expect(orderbook.addOrder(invalidOrder)).rejects.toThrow('Invalid amount');
    });

    it('should reject order with invalid price', async () => {
      const invalidOrder = {
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '-100',
      };

      await expect(orderbook.addOrder(invalidOrder)).rejects.toThrow('Invalid price');
    });

    it('should reject order with mismatched pair', async () => {
      const invalidOrder = {
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000',
        pair: 'ETH/USD',
      };

      await expect(orderbook.addOrder(invalidOrder)).rejects.toThrow(
        'Order pair ETH/USD does not match orderbook pair BTC/USD'
      );
    });
  });

  describe('Order Placement', () => {
    it('should add buy order successfully', async () => {
      const order = {
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      const result = await orderbook.addOrder(order);

      expect(result.success).toBeUndefined(); // No success field in result
      expect(result.trades).toEqual([]);
      expect(result.remainingOrder).toBeDefined();
      expect(result.remainingOrder.side).toBe('buy');
      expect(result.remainingOrder.amount).toBe('1');
      expect(result.remainingOrder.price).toBe('50000');
      expect(orderbook.orderCount).toBe(1);
    });

    it('should add sell order successfully', async () => {
      const order = {
        userId: 'user1',
        side: 'sell',
        amount: '1.0',
        price: '51000',
      };

      const result = await orderbook.addOrder(order);

      expect(result.trades).toEqual([]);
      expect(result.remainingOrder).toBeDefined();
      expect(result.remainingOrder.side).toBe('sell');
      expect(result.remainingOrder.amount).toBe('1');
      expect(result.remainingOrder.price).toBe('51000');
      expect(orderbook.orderCount).toBe(1);
    });

    it('should prevent concurrent order processing', async () => {
      const order1 = {
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      const order2 = {
        userId: 'user2',
        side: 'sell',
        amount: '1.0',
        price: '51000',
      };

      // Start first order processing
      const promise1 = orderbook.addOrder(order1);

      // Try to process second order while first is processing
      await expect(orderbook.addOrder(order2)).rejects.toThrow(
        'OrderBook is currently processing another order'
      );

      // Wait for first order to complete
      await promise1;
    });
  });

  describe('Order Matching', () => {
    it('should match buy and sell orders at same price', async () => {
      // Add sell order first
      const sellOrder = {
        userId: 'user1',
        side: 'sell',
        amount: '1.0',
        price: '50000',
      };

      const sellResult = await orderbook.addOrder(sellOrder);
      expect(sellResult.trades).toEqual([]);

      // Add matching buy order
      const buyOrder = {
        userId: 'user2',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      const buyResult = await orderbook.addOrder(buyOrder);

      expect(buyResult.trades).toHaveLength(1);
      expect(buyResult.trades[0].amount).toBe('1');
      expect(buyResult.trades[0].price).toBe('50000');
      expect(buyResult.remainingOrder).toBeNull();
      expect(orderbook.tradeCount).toBe(1);
    });

    it('should match buy order with sell order at better price', async () => {
      // Add sell order at lower price
      const sellOrder = {
        userId: 'user1',
        side: 'sell',
        amount: '1.0',
        price: '49000',
      };

      await orderbook.addOrder(sellOrder);

      // Add buy order at higher price
      const buyOrder = {
        userId: 'user2',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      const buyResult = await orderbook.addOrder(buyOrder);

      expect(buyResult.trades).toHaveLength(1);
      expect(buyResult.trades[0].price).toBe('49000'); // Should use sell order price
      expect(buyResult.remainingOrder).toBeNull();
    });

    it('should partially fill orders', async () => {
      // Add large sell order
      const sellOrder = {
        userId: 'user1',
        side: 'sell',
        amount: '5.0',
        price: '50000',
      };

      await orderbook.addOrder(sellOrder);

      // Add smaller buy order
      const buyOrder = {
        userId: 'user2',
        side: 'buy',
        amount: '2.0',
        price: '50000',
      };

      const buyResult = await orderbook.addOrder(buyOrder);

      expect(buyResult.trades).toHaveLength(1);
      expect(buyResult.trades[0].amount).toBe('2');
      expect(buyResult.remainingOrder).toBeNull();

      // Check that sell order was partially filled
      const orderbookSnapshot = orderbook.getOrderBook();
      expect(orderbookSnapshot.asks).toHaveLength(1);
      expect(orderbookSnapshot.asks[0].amount).toBe('3'); // 5.0 - 2.0
    });

    it('should match multiple orders in price-time priority', async () => {
      // Add multiple sell orders
      const sellOrder1 = {
        userId: 'user1',
        side: 'sell',
        amount: '1.0',
        price: '50000',
      };

      const sellOrder2 = {
        userId: 'user2',
        side: 'sell',
        amount: '1.0',
        price: '50000',
      };

      await orderbook.addOrder(sellOrder1);
      await orderbook.addOrder(sellOrder2);

      // Add buy order that should match both
      const buyOrder = {
        userId: 'user3',
        side: 'buy',
        amount: '2.0',
        price: '50000',
      };

      const buyResult = await orderbook.addOrder(buyOrder);

      expect(buyResult.trades).toHaveLength(2);
      expect(buyResult.remainingOrder).toBeNull();
      expect(orderbook.tradeCount).toBe(2);
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel pending order successfully', async () => {
      const order = {
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      const result = await orderbook.addOrder(order);
      const orderId = result.remainingOrder.id;

      const cancelled = orderbook.cancelOrder(orderId);
      expect(cancelled).toBe(true);
      expect(orderbook.orderCount).toBe(1);
    });

    it('should not cancel non-existent order', () => {
      const cancelled = orderbook.cancelOrder('non-existent-id');
      expect(cancelled).toBe(false);
    });

    it('should not cancel filled order', async () => {
      // Add sell order
      const sellOrder = {
        userId: 'user1',
        side: 'sell',
        amount: '1.0',
        price: '50000',
      };

      await orderbook.addOrder(sellOrder);

      // Add matching buy order
      const buyOrder = {
        userId: 'user2',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      const buyResult = await orderbook.addOrder(buyOrder);
      const orderId = buyResult.trades[0].buyOrderId;

      const cancelled = orderbook.cancelOrder(orderId);
      expect(cancelled).toBe(false);
    });
  });

  describe('OrderBook Queries', () => {
    beforeEach(async () => {
      // Add some test orders
      await orderbook.addOrder({
        userId: 'user1',
        side: 'buy',
        amount: '2.0',
        price: '49000',
      });

      await orderbook.addOrder({
        userId: 'user2',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      });

      await orderbook.addOrder({
        userId: 'user3',
        side: 'sell',
        amount: '1.5',
        price: '51000',
      });

      await orderbook.addOrder({
        userId: 'user4',
        side: 'sell',
        amount: '2.0',
        price: '52000',
      });
    });

    it('should get orderbook snapshot', () => {
      const snapshot = orderbook.getOrderBook();

      expect(snapshot.pair).toBe('BTC/USD');
      expect(snapshot.bids).toHaveLength(2);
      expect(snapshot.asks).toHaveLength(2);

      // Check bids are sorted by price descending
      expect(parseFloat(snapshot.bids[0].price)).toBeGreaterThan(
        parseFloat(snapshot.bids[1].price)
      );

      // Check asks are sorted by price ascending
      expect(parseFloat(snapshot.asks[0].price)).toBeLessThan(parseFloat(snapshot.asks[1].price));
    });

    it('should get orderbook with depth limit', () => {
      const snapshot = orderbook.getOrderBook(1);

      expect(snapshot.bids).toHaveLength(1);
      expect(snapshot.asks).toHaveLength(1);
    });

    it('should get user orders', () => {
      const userOrders = orderbook.getUserOrders('user1');

      expect(userOrders).toHaveLength(1);
      expect(userOrders[0].userId).toBe('user1');
      expect(userOrders[0].side).toBe('buy');
    });

    it('should get order by ID', async () => {
      const order = {
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      const result = await orderbook.addOrder(order);
      const orderId = result.remainingOrder.id;

      const retrievedOrder = orderbook.getOrder(orderId);
      expect(retrievedOrder).toBeDefined();
      expect(retrievedOrder.id).toBe(orderId);
      expect(retrievedOrder.userId).toBe('user1');
    });

    it('should get recent trades', async () => {
      // Create a trade
      const sellOrder = {
        userId: 'user1',
        side: 'sell',
        amount: '1.0',
        price: '50000',
      };

      await orderbook.addOrder(sellOrder);

      const buyOrder = {
        userId: 'user2',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      await orderbook.addOrder(buyOrder);

      const trades = orderbook.getRecentTrades();
      expect(trades).toHaveLength(1);
      expect(trades[0].amount).toBe('1');
      expect(trades[0].price).toBe('50000');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amount orders', async () => {
      const order = {
        userId: 'user1',
        side: 'buy',
        amount: '0',
        price: '50000',
      };

      await expect(orderbook.addOrder(order)).rejects.toThrow('Invalid amount');
    });

    it('should handle very small amounts', async () => {
      const order = {
        userId: 'user1',
        side: 'buy',
        amount: '0.00000001',
        price: '50000',
      };

      const result = await orderbook.addOrder(order);
      expect(result.remainingOrder).toBeDefined();
      expect(result.remainingOrder.amount).toBe('1e-8');
    });

    it('should handle very large amounts', async () => {
      const order = {
        userId: 'user1',
        side: 'buy',
        amount: '999999999.99999999',
        price: '50000',
      };

      const result = await orderbook.addOrder(order);
      expect(result.remainingOrder).toBeDefined();
      expect(result.remainingOrder.amount).toBe('1000000000');
    });

    it('should handle orders with same user ID', async () => {
      const order1 = {
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      const order2 = {
        userId: 'user1',
        side: 'sell',
        amount: '1.0',
        price: '51000',
      };

      await orderbook.addOrder(order1);
      await orderbook.addOrder(order2);

      expect(orderbook.orderCount).toBe(2);
    });
  });
});
