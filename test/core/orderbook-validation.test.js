/**
 * @fileoverview Tests for OrderBook validation functionality
 * Testing error cases and validation logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import OrderBook from '../../src/core/orderbook.js';

describe('OrderBook - Validation Tests', () => {
  let orderbook;

  beforeEach(() => {
    orderbook = new OrderBook('BTC/USD');
  });

  describe('Order Validation Errors', () => {
    it('should handle invalid userId gracefully', async () => {
      const invalidOrder = {
        userId: '',  // empty userId
        side: 'buy',
        amount: '1.0',
        price: '50000'
      };

      // This should not crash, but process the error
      await orderbook.addOrder(invalidOrder);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Order should not be added
      expect(orderbook.orderCount).toBe(0);
    });

    it('should handle invalid side gracefully', async () => {
      const invalidOrder = {
        userId: 'user123',
        side: 'invalid',  // invalid side
        amount: '1.0',
        price: '50000'
      };

      // This should not crash
      await orderbook.addOrder(invalidOrder);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Order should not be added
      expect(orderbook.orderCount).toBe(0);
    });

    it('should handle invalid amount gracefully', async () => {
      const invalidOrder = {
        userId: 'user123',
        side: 'buy',
        amount: '0',  // zero amount
        price: '50000'
      };

      // This should not crash
      await orderbook.addOrder(invalidOrder);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Order should not be added
      expect(orderbook.orderCount).toBe(0);
    });

    it('should handle invalid price gracefully', async () => {
      const invalidOrder = {
        userId: 'user123',
        side: 'buy',
        amount: '1.0',
        price: '-100'  // negative price
      };

      // This should not crash
      await orderbook.addOrder(invalidOrder);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Order should not be added
      expect(orderbook.orderCount).toBe(0);
    });
  });

  describe('Valid Edge Cases', () => {
    it('should handle very small amounts', async () => {
      const orderData = {
        userId: 'user123',
        side: 'buy',
        amount: '0.000001',
        price: '50000'
      };

      await orderbook.addOrder(orderData);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(orderbook.orderCount).toBe(1);
    });

    it('should handle very large prices', async () => {
      const orderData = {
        userId: 'user123',
        side: 'buy',
        amount: '1.0',
        price: '1000000'
      };

      await orderbook.addOrder(orderData);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(orderbook.orderCount).toBe(1);
    });
  });
});