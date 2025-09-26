/**
 * @fileoverview Tests for OrderBook cancel functionality
 * Testing order cancellation and retrieval
 */

import { describe, it, expect, beforeEach } from 'vitest';
import OrderBook from '../../src/core/orderbook.js';

describe('OrderBook - Cancel Order Tests', () => {
  let orderbook;

  beforeEach(() => {
    orderbook = new OrderBook('BTC/USD');
  });

  describe('Order Cancellation', () => {
    it('should handle cancellation of non-existent order', () => {
      const result = orderbook.cancelOrder('non-existent-id');
      expect(result).toBe(false);
    });

    it('should cancel an existing order', async () => {
      // First add an order
      const orderData = {
        userId: 'user123',
        side: 'buy',
        amount: '1.0',
        price: '50000'
      };

      await orderbook.addOrder(orderData);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Get the order to find its ID
      const userOrders = orderbook.getUserOrders('user123');
      expect(userOrders.length).toBe(1);

      const orderId = userOrders[0].id;

      // Cancel the order
      const result = orderbook.cancelOrder(orderId);
      expect(result).toBe(true);

      // Check that order is now cancelled
      const cancelledOrder = orderbook.getOrder(orderId);
      expect(cancelledOrder.status).toBe('cancelled');
    });

    it('should handle multiple orders for same user', async () => {
      // Add multiple orders
      const order1 = {
        userId: 'user123',
        side: 'buy',
        amount: '1.0',
        price: '50000'
      };

      const order2 = {
        userId: 'user123',
        side: 'sell',
        amount: '0.5',
        price: '52000'
      };

      await orderbook.addOrder(order1);
      await orderbook.addOrder(order2);
      await new Promise(resolve => setTimeout(resolve, 20));

      // Check user has 2 orders
      const userOrders = orderbook.getUserOrders('user123');
      expect(userOrders.length).toBe(2);

      // Cancel one order
      const orderId = userOrders[0].id;
      const result = orderbook.cancelOrder(orderId);
      expect(result).toBe(true);

      // Check user still has orders but one is cancelled
      const updatedUserOrders = orderbook.getUserOrders('user123');
      const cancelledOrder = updatedUserOrders.find(order => order.id === orderId);
      expect(cancelledOrder.status).toBe('cancelled');
    });
  });

  describe('Order Retrieval', () => {
    it('should retrieve user orders correctly', async () => {
      const orderData = {
        userId: 'testuser',
        side: 'buy',
        amount: '2.0',
        price: '45000'
      };

      await orderbook.addOrder(orderData);
      await new Promise(resolve => setTimeout(resolve, 10));

      const userOrders = orderbook.getUserOrders('testuser');
      expect(userOrders.length).toBe(1);
      expect(userOrders[0].userId).toBe('testuser');
      expect(userOrders[0].side).toBe('buy');
    });

    it('should return empty array for user with no orders', () => {
      const userOrders = orderbook.getUserOrders('nonexistent-user');
      expect(Array.isArray(userOrders)).toBe(true);
      expect(userOrders.length).toBe(0);
    });
  });
});