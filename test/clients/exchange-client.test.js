/**
 * @fileoverview Unit tests for ExchangeClient class
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import ExchangeClient from '../../src/clients/exchange-client.js';
import OrderBook from '../../src/core/orderbook.js';
import GrenacheService from '../../src/services/grenache-service.js';

// Mock dependencies
vi.mock('../src/core/orderbook.js');
vi.mock('../src/services/grenache-service.js');

describe('ExchangeClient', () => {
  let exchangeClient;
  let mockOrderBook;
  let mockGrenacheService;

  beforeEach(() => {
    // Create mock instances
    mockOrderBook = {
      addOrder: vi.fn(),
      cancelOrder: vi.fn(),
      getOrder: vi.fn(),
      getOrderBook: vi.fn(),
      getUserOrders: vi.fn(),
      getRecentTrades: vi.fn(),
      orderCount: 0,
      tradeCount: 0,
    };

    mockGrenacheService = {
      initialize: vi.fn(),
      destroy: vi.fn(),
      addOrderHandler: vi.fn(),
      addTradeHandler: vi.fn(),
      addOrderbookHandler: vi.fn(),
      distributeOrder: vi.fn(),
      broadcastTrade: vi.fn(),
      nodeId: 'mock-node-id',
      isInitialized: false,
    };

    // Mock constructors
    vi.mocked(OrderBook).mockImplementation(() => mockOrderBook);
    vi.mocked(GrenacheService).mockImplementation(() => mockGrenacheService);

    exchangeClient = new ExchangeClient({
      grapeUrl: 'http://127.0.0.1:30001',
      pair: 'BTC/USD',
      userId: 'test-user',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create client with default config', () => {
      const client = new ExchangeClient();

      expect(client.userId).toBeDefined();
      expect(client.pair).toBe('BTC/USD');
      expect(client.orderbook).toBe(mockOrderBook);
      expect(client.grenacheService).toBe(mockGrenacheService);
    });

    it('should create client with custom config', () => {
      const config = {
        grapeUrl: 'http://localhost:40001',
        pair: 'ETH/USD',
        userId: 'custom-user',
      };

      const client = new ExchangeClient(config);

      expect(client.userId).toBe('custom-user');
      expect(client.pair).toBe('ETH/USD');
    });

    it('should initialize with correct state', () => {
      expect(exchangeClient.isInitialized).toBe(false);
      expect(exchangeClient.userId).toBe('test-user');
      expect(exchangeClient.pair).toBe('BTC/USD');
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      mockGrenacheService.initialize.mockResolvedValue();

      await expect(exchangeClient.initialize()).resolves.not.toThrow();

      expect(mockGrenacheService.initialize).toHaveBeenCalled();
      expect(exchangeClient.isInitialized).toBe(true);
    });

    it('should not initialize twice', async () => {
      mockGrenacheService.initialize.mockResolvedValue();

      await exchangeClient.initialize();
      await exchangeClient.initialize(); // Should not throw

      expect(mockGrenacheService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', async () => {
      mockGrenacheService.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(exchangeClient.initialize()).rejects.toThrow('Init failed');
      expect(exchangeClient.isInitialized).toBe(false);
    });
  });

  describe('Order Placement', () => {
    beforeEach(async () => {
      mockGrenacheService.initialize.mockResolvedValue();
      await exchangeClient.initialize();
    });

    it('should place buy order successfully', async () => {
      const mockMatchResult = {
        trades: [],
        remainingOrder: {
          id: 'order123',
          userId: 'test-user',
          side: 'buy',
          amount: '1.0',
          price: '50000',
        },
      };

      mockOrderBook.addOrder.mockResolvedValue(mockMatchResult);
      mockOrderBook.getOrder.mockReturnValue(mockMatchResult.remainingOrder);
      mockGrenacheService.distributeOrder.mockResolvedValue({
        success: true,
        distributedTo: ['node1'],
        failedTo: [],
      });

      const result = await exchangeClient.placeBuyOrder('1.0', '50000');

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order123');
      expect(result.trades).toEqual([]);
      expect(result.remainingOrder).toBe(mockMatchResult.remainingOrder);
      expect(mockOrderBook.addOrder).toHaveBeenCalledWith({
        userId: 'test-user',
        side: 'buy',
        amount: '1.0',
        price: '50000',
        pair: 'BTC/USD',
      });
    });

    it('should place sell order successfully', async () => {
      const mockMatchResult = {
        trades: [],
        remainingOrder: {
          id: 'order456',
          userId: 'test-user',
          side: 'sell',
          amount: '1.0',
          price: '51000',
        },
      };

      mockOrderBook.addOrder.mockResolvedValue(mockMatchResult);
      mockOrderBook.getOrder.mockReturnValue(mockMatchResult.remainingOrder);
      mockGrenacheService.distributeOrder.mockResolvedValue({
        success: true,
        distributedTo: ['node1'],
        failedTo: [],
      });

      const result = await exchangeClient.placeSellOrder('1.0', '51000');

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order456');
      expect(mockOrderBook.addOrder).toHaveBeenCalledWith({
        userId: 'test-user',
        side: 'sell',
        amount: '1.0',
        price: '51000',
        pair: 'BTC/USD',
      });
    });

    it('should handle order placement errors', async () => {
      mockOrderBook.addOrder.mockRejectedValue(new Error('Order failed'));

      const result = await exchangeClient.placeBuyOrder('1.0', '50000');

      expect(result.success).toBe(false);
      expect(result.orderId).toBeNull();
      expect(result.error).toBe('Order failed');
    });

    it('should reject orders when not initialized', async () => {
      const uninitializedClient = new ExchangeClient();

      await expect(uninitializedClient.placeBuyOrder('1.0', '50000')).rejects.toThrow(
        'Exchange client not initialized'
      );
    });

    it('should broadcast trades after matching', async () => {
      const mockTrade = {
        id: 'trade123',
        buyOrderId: 'buy123',
        sellOrderId: 'sell123',
        amount: '1.0',
        price: '50000',
      };

      const mockMatchResult = {
        trades: [mockTrade],
        remainingOrder: null,
      };

      mockOrderBook.addOrder.mockResolvedValue(mockMatchResult);
      mockGrenacheService.distributeOrder.mockResolvedValue({
        success: true,
        distributedTo: ['node1'],
        failedTo: [],
      });
      mockGrenacheService.broadcastTrade.mockResolvedValue(true);

      await exchangeClient.placeBuyOrder('1.0', '50000');

      expect(mockGrenacheService.broadcastTrade).toHaveBeenCalledWith(mockTrade);
    });
  });

  describe('Order Management', () => {
    beforeEach(async () => {
      mockGrenacheService.initialize.mockResolvedValue();
      await exchangeClient.initialize();
    });

    it('should cancel order successfully', () => {
      mockOrderBook.cancelOrder.mockReturnValue(true);

      const result = exchangeClient.cancelOrder('order123');

      expect(result).toBe(true);
      expect(mockOrderBook.cancelOrder).toHaveBeenCalledWith('order123');
    });

    it('should get order by ID', () => {
      const mockOrder = {
        id: 'order123',
        userId: 'test-user',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      mockOrderBook.getOrder.mockReturnValue(mockOrder);

      const result = exchangeClient.getOrder('order123');

      expect(result).toBe(mockOrder);
      expect(mockOrderBook.getOrder).toHaveBeenCalledWith('order123');
    });

    it('should get user orders', () => {
      const mockOrders = [
        { id: 'order1', userId: 'test-user' },
        { id: 'order2', userId: 'test-user' },
      ];

      mockOrderBook.getUserOrders.mockReturnValue(mockOrders);

      const result = exchangeClient.getUserOrders();

      expect(result).toBe(mockOrders);
      expect(mockOrderBook.getUserOrders).toHaveBeenCalledWith('test-user');
    });
  });

  describe('OrderBook Queries', () => {
    beforeEach(async () => {
      mockGrenacheService.initialize.mockResolvedValue();
      await exchangeClient.initialize();
    });

    it('should get orderbook snapshot', () => {
      const mockOrderbook = {
        pair: 'BTC/USD',
        bids: [{ price: '50000', amount: '1.0' }],
        asks: [{ price: '51000', amount: '1.0' }],
      };

      mockOrderBook.getOrderBook.mockReturnValue(mockOrderbook);

      const result = exchangeClient.getOrderBook(10);

      expect(result).toBe(mockOrderbook);
      expect(mockOrderBook.getOrderBook).toHaveBeenCalledWith(10);
    });

    it('should get recent trades', () => {
      const mockTrades = [
        { id: 'trade1', amount: '1.0', price: '50000' },
        { id: 'trade2', amount: '0.5', price: '51000' },
      ];

      mockOrderBook.getRecentTrades.mockReturnValue(mockTrades);

      const result = exchangeClient.getRecentTrades(50);

      expect(result).toBe(mockTrades);
      expect(mockOrderBook.getRecentTrades).toHaveBeenCalledWith(50);
    });
  });

  describe('History Management', () => {
    beforeEach(async () => {
      mockGrenacheService.initialize.mockResolvedValue();
      await exchangeClient.initialize();
    });

    it('should get order history', () => {
      const result = exchangeClient.getOrderHistory();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should get trade history', () => {
      const result = exchangeClient.getTradeHistory();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should store orders in history after placement', async () => {
      const mockMatchResult = {
        trades: [],
        remainingOrder: {
          id: 'order123',
          userId: 'test-user',
          side: 'buy',
          amount: '1.0',
          price: '50000',
        },
      };

      mockOrderBook.addOrder.mockResolvedValue(mockMatchResult);
      mockOrderBook.getOrder.mockReturnValue(mockMatchResult.remainingOrder);
      mockGrenacheService.distributeOrder.mockResolvedValue({
        success: true,
        distributedTo: ['node1'],
        failedTo: [],
      });

      await exchangeClient.placeBuyOrder('1.0', '50000');

      const history = exchangeClient.getOrderHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('order123');
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      mockGrenacheService.initialize.mockResolvedValue();
      await exchangeClient.initialize();
    });

    it('should handle incoming orders from other nodes', async () => {
      const mockOrder = {
        id: 'remote-order123',
        userId: 'remote-user',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      const mockMatchResult = {
        trades: [],
        remainingOrder: mockOrder,
      };

      mockOrderBook.addOrder.mockResolvedValue(mockMatchResult);
      mockGrenacheService.broadcastTrade.mockResolvedValue(true);

      // Simulate incoming order
      const orderHandler = mockGrenacheService.addOrderHandler.mock.calls[0][0];
      await orderHandler(mockOrder);

      expect(mockOrderBook.addOrder).toHaveBeenCalledWith(mockOrder);
    });

    it('should handle incoming trades from other nodes', () => {
      const mockTrade = {
        id: 'remote-trade123',
        amount: '1.0',
        price: '50000',
      };

      // Simulate incoming trade
      const tradeHandler = mockGrenacheService.addTradeHandler.mock.calls[0][0];
      tradeHandler(mockTrade);

      const history = exchangeClient.getTradeHistory();
      expect(history).toContain(mockTrade);
    });

    it('should handle incoming orderbook sync from other nodes', () => {
      const mockOrderbook = {
        pair: 'BTC/USD',
        bids: [],
        asks: [],
      };

      // Simulate incoming orderbook sync
      const orderbookHandler = mockGrenacheService.addOrderbookHandler.mock.calls[0][0];

      // Should not throw
      expect(() => orderbookHandler(mockOrderbook)).not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should destroy client properly', async () => {
      mockGrenacheService.initialize.mockResolvedValue();
      await exchangeClient.initialize();

      exchangeClient.destroy();

      expect(mockGrenacheService.destroy).toHaveBeenCalled();
      expect(exchangeClient.isInitialized).toBe(false);
    });

    it('should handle destroy when not initialized', () => {
      const uninitializedClient = new ExchangeClient();

      // Should not throw
      expect(() => uninitializedClient.destroy()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      mockGrenacheService.initialize.mockResolvedValue();
      await exchangeClient.initialize();
    });

    it('should handle distribution failures gracefully', async () => {
      const mockMatchResult = {
        trades: [],
        remainingOrder: {
          id: 'order123',
          userId: 'test-user',
          side: 'buy',
          amount: '1.0',
          price: '50000',
        },
      };

      mockOrderBook.addOrder.mockResolvedValue(mockMatchResult);
      mockOrderBook.getOrder.mockReturnValue(mockMatchResult.remainingOrder);
      mockGrenacheService.distributeOrder.mockRejectedValue(new Error('Distribution failed'));

      const result = await exchangeClient.placeBuyOrder('1.0', '50000');

      expect(result.success).toBe(true); // Order should still succeed
      expect(result.distribution.success).toBe(false);
    });

    it('should handle broadcast failures gracefully', async () => {
      const mockTrade = {
        id: 'trade123',
        amount: '1.0',
        price: '50000',
      };

      const mockMatchResult = {
        trades: [mockTrade],
        remainingOrder: null,
      };

      mockOrderBook.addOrder.mockResolvedValue(mockMatchResult);
      mockGrenacheService.distributeOrder.mockResolvedValue({
        success: true,
        distributedTo: ['node1'],
        failedTo: [],
      });
      mockGrenacheService.broadcastTrade.mockRejectedValue(new Error('Broadcast failed'));

      const result = await exchangeClient.placeBuyOrder('1.0', '50000');

      expect(result.success).toBe(true); // Order should still succeed
    });

    it('should handle empty trade results', async () => {
      const mockMatchResult = {
        trades: [],
        remainingOrder: {
          id: 'order123',
          userId: 'test-user',
          side: 'buy',
          amount: '1.0',
          price: '50000',
        },
      };

      mockOrderBook.addOrder.mockResolvedValue(mockMatchResult);
      mockOrderBook.getOrder.mockReturnValue(mockMatchResult.remainingOrder);
      mockGrenacheService.distributeOrder.mockResolvedValue({
        success: true,
        distributedTo: ['node1'],
        failedTo: [],
      });

      const result = await exchangeClient.placeBuyOrder('1.0', '50000');

      expect(result.success).toBe(true);
      expect(result.trades).toEqual([]);
      expect(mockGrenacheService.broadcastTrade).not.toHaveBeenCalled();
    });
  });
});
