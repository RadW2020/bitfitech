/**
 * @fileoverview Basic tests for OrderBook class
 * Testing step by step to ensure each test works correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import OrderBook from '../../src/core/orderbook.js';

describe('OrderBook - Basic Tests', () => {
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

  describe('Getters', () => {
    it('should have correct pair', () => {
      expect(orderbook.pair).toBe('BTC/USD');
    });

    it('should return zero counts initially', () => {
      expect(orderbook.orderCount).toBe(0);
      expect(orderbook.tradeCount).toBe(0);
    });

    it('should not be processing initially', () => {
      expect(orderbook.isProcessing).toBe(false);
    });
  });

  describe('Query Methods', () => {
    it('should return empty orderbook initially', () => {
      const orderbook_data = orderbook.getOrderBook();
      expect(orderbook_data).toHaveProperty('bids');
      expect(orderbook_data).toHaveProperty('asks');
      expect(orderbook_data.bids).toEqual([]);
      expect(orderbook_data.asks).toEqual([]);
    });

    it('should return empty trades initially', () => {
      const trades = orderbook.getRecentTrades();
      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBe(0);
    });

    it('should return empty user orders initially', () => {
      const userOrders = orderbook.getUserOrders('user123');
      expect(Array.isArray(userOrders)).toBe(true);
      expect(userOrders.length).toBe(0);
    });

    it('should return undefined for non-existent order', () => {
      const order = orderbook.getOrder('non-existent-id');
      expect(order).toBeUndefined();
    });
  });
});