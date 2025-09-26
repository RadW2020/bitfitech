/**
 * @fileoverview Tests for OrderBook addOrder functionality
 * Testing step by step to ensure each test works correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import OrderBook from '../../src/core/orderbook.js';

describe('OrderBook - Add Order Tests', () => {
  let orderbook;

  beforeEach(() => {
    orderbook = new OrderBook('BTC/USD');
  });

  describe('Valid Order Processing', () => {
    it('should add a simple buy order', async () => {
      const orderData = {
        userId: 'user123',
        side: 'buy',
        amount: '1.0',
        price: '50000'
      };

      // Add order and wait for processing
      await orderbook.addOrder(orderData);

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check that order count increased
      expect(orderbook.orderCount).toBe(1);
    });

    it('should add a simple sell order', async () => {
      const orderData = {
        userId: 'user123',
        side: 'sell',
        amount: '0.5',
        price: '51000'
      };

      // Add order and wait for processing
      await orderbook.addOrder(orderData);

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check that order count increased
      expect(orderbook.orderCount).toBe(1);
    });

    it('should handle multiple orders', async () => {
      const buyOrder = {
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000'
      };

      const sellOrder = {
        userId: 'user2',
        side: 'sell',
        amount: '0.5',
        price: '52000'
      };

      // Add orders
      await orderbook.addOrder(buyOrder);
      await orderbook.addOrder(sellOrder);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 20));

      // Check that both orders were added
      expect(orderbook.orderCount).toBe(2);
    });

    it('should update orderbook data after adding orders', async () => {
      const buyOrder = {
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000'
      };

      const sellOrder = {
        userId: 'user2',
        side: 'sell',
        amount: '0.5',
        price: '52000'
      };

      // Add orders
      await orderbook.addOrder(buyOrder);
      await orderbook.addOrder(sellOrder);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 20));

      // Check orderbook data
      const orderbookData = orderbook.getOrderBook();
      expect(orderbookData.bids.length).toBeGreaterThan(0);
      expect(orderbookData.asks.length).toBeGreaterThan(0);
    });

    it('should handle order matching and create trades', async () => {
      // Add a buy order at 51000
      const buyOrder = {
        userId: 'buyer',
        side: 'buy',
        amount: '1.0',
        price: '51000'
      };

      // Add a sell order at 50000 (should match)
      const sellOrder = {
        userId: 'seller',
        side: 'sell',
        amount: '0.5',
        price: '50000'
      };

      await orderbook.addOrder(buyOrder);
      await orderbook.addOrder(sellOrder);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 30));

      // Check if trade was created
      const trades = orderbook.getRecentTrades();
      expect(trades.length).toBeGreaterThan(0);
      expect(orderbook.tradeCount).toBeGreaterThan(0);
    });
  });
});