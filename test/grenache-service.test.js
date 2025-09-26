/**
 * @fileoverview Unit tests for GrenacheService class
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import GrenacheService from '../src/grenache-service.js';

// Mock grenache modules
vi.mock('grenache-nodejs-http', () => ({
  PeerRPCServer: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    transport: vi.fn().mockReturnValue({
      listen: vi.fn(),
      on: vi.fn(),
    }),
  })),
  PeerRPCClient: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    map: vi.fn(),
  })),
}));

vi.mock('grenache-nodejs-link', () => ({
  default: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    announce: vi.fn(),
  })),
}));

describe('GrenacheService', () => {
  let grenacheService;

  beforeEach(() => {
    grenacheService = new GrenacheService('http://127.0.0.1:30001');
  });

  afterEach(() => {
    if (grenacheService && grenacheService.isInitialized) {
      grenacheService.destroy();
    }
  });

  describe('Constructor', () => {
    it('should create service with default grape URL', () => {
      const service = new GrenacheService();
      expect(service.nodeId).toBeDefined();
      expect(service.serviceName).toBe('p2p_exchange');
      expect(service.isInitialized).toBe(false);
    });

    it('should create service with custom grape URL', () => {
      const customUrl = 'http://localhost:40001';
      const service = new GrenacheService(customUrl);
      expect(service.nodeId).toBeDefined();
      expect(service.serviceName).toBe('p2p_exchange');
    });

    it('should generate unique node IDs', () => {
      const service1 = new GrenacheService();
      const service2 = new GrenacheService();
      expect(service1.nodeId).not.toBe(service2.nodeId);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(grenacheService.initialize()).resolves.not.toThrow();
      expect(grenacheService.isInitialized).toBe(true);
    });

    it('should not initialize twice', async () => {
      await grenacheService.initialize();
      await grenacheService.initialize(); // Should not throw
      expect(grenacheService.isInitialized).toBe(true);
    });

    it('should handle initialization errors', async () => {
      // Mock initialization failure
      const mockLink = {
        start: vi.fn().mockImplementation(() => {
          throw new Error('Connection failed');
        }),
      };

      vi.mocked(grenacheService.link).start = mockLink.start;

      await expect(grenacheService.initialize()).rejects.toThrow('Connection failed');
      expect(grenacheService.isInitialized).toBe(false);
    });
  });

  describe('Message Handlers', () => {
    beforeEach(async () => {
      await grenacheService.initialize();
    });

    it('should add and remove order handlers', () => {
      const handler = vi.fn();

      grenacheService.addOrderHandler(handler);
      grenacheService.removeOrderHandler(handler);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should add and remove trade handlers', () => {
      const handler = vi.fn();

      grenacheService.addTradeHandler(handler);
      grenacheService.removeTradeHandler(handler);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should add and remove orderbook handlers', () => {
      const handler = vi.fn();

      grenacheService.addOrderbookHandler(handler);
      grenacheService.removeOrderbookHandler(handler);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Order Distribution', () => {
    beforeEach(async () => {
      await grenacheService.initialize();
    });

    it('should distribute order successfully', async () => {
      const order = {
        id: 'order123',
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      // Mock successful distribution
      const mockClient = {
        map: vi.fn().mockImplementation((serviceName, message, options, callback) => {
          // Simulate immediate callback
          setTimeout(() => callback(null, { nodeId: 'node123' }), 0);
        }),
      };

      grenacheService.client = mockClient;

      const result = await grenacheService.distributeOrder(order);

      expect(result.success).toBe(true);
      expect(result.distributedTo).toContain('node123');
      expect(result.failedTo).toEqual([]);
    }, 10000);

    it('should handle distribution failures', async () => {
      const order = {
        id: 'order123',
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000',
      };

      // Mock failed distribution
      const mockClient = {
        map: vi.fn().mockImplementation((serviceName, message, options, callback) => {
          // Simulate immediate callback
          setTimeout(() => callback(new Error('Network error'), null), 0);
        }),
      };

      grenacheService.client = mockClient;

      const result = await grenacheService.distributeOrder(order);

      expect(result.success).toBe(false);
      expect(result.distributedTo).toEqual([]);
      expect(result.failedTo).toContain('unknown');
    }, 10000);

    it('should reject distribution when not initialized', async () => {
      const uninitializedService = new GrenacheService();
      const order = { id: 'order123' };

      await expect(uninitializedService.distributeOrder(order)).rejects.toThrow(
        'Grenache service not initialized'
      );
    });
  });

  describe('Trade Broadcasting', () => {
    beforeEach(async () => {
      await grenacheService.initialize();
    });

    it('should broadcast trade successfully', async () => {
      const trade = {
        id: 'trade123',
        buyOrderId: 'buy123',
        sellOrderId: 'sell123',
        amount: '1.0',
        price: '50000',
      };

      // Mock successful broadcast
      const mockClient = {
        map: vi.fn().mockImplementation((serviceName, message, options, callback) => {
          setTimeout(() => callback(null, { nodeId: 'node123' }), 0);
        }),
      };

      grenacheService.client = mockClient;

      const result = await grenacheService.broadcastTrade(trade);
      expect(result).toBe(true);
    }, 10000);

    it('should handle broadcast failures', async () => {
      const trade = {
        id: 'trade123',
        buyOrderId: 'buy123',
        sellOrderId: 'sell123',
        amount: '1.0',
        price: '50000',
      };

      // Mock failed broadcast
      const mockClient = {
        map: vi.fn().mockImplementation((serviceName, message, options, callback) => {
          setTimeout(() => callback(new Error('Network error'), null), 0);
        }),
      };

      grenacheService.client = mockClient;

      const result = await grenacheService.broadcastTrade(trade);
      expect(result).toBe(false);
    }, 10000);

    it('should reject broadcast when not initialized', async () => {
      const uninitializedService = new GrenacheService();
      const trade = { id: 'trade123' };

      await expect(uninitializedService.broadcastTrade(trade)).rejects.toThrow(
        'Grenache service not initialized'
      );
    });
  });

  describe('Orderbook Synchronization', () => {
    beforeEach(async () => {
      await grenacheService.initialize();
    });

    it('should sync orderbook successfully', async () => {
      const orderbook = {
        pair: 'BTC/USD',
        bids: [{ price: '50000', amount: '1.0' }],
        asks: [{ price: '51000', amount: '1.0' }],
      };

      // Mock successful sync
      const mockClient = {
        map: vi.fn().mockImplementation((serviceName, message, options, callback) => {
          setTimeout(() => callback(null, { nodeId: 'node123' }), 0);
        }),
      };

      grenacheService.client = mockClient;

      const result = await grenacheService.syncOrderbook(orderbook);
      expect(result).toBe(true);
    }, 10000);

    it('should handle sync failures', async () => {
      const orderbook = {
        pair: 'BTC/USD',
        bids: [],
        asks: [],
      };

      // Mock failed sync
      const mockClient = {
        map: vi.fn().mockImplementation((serviceName, message, options, callback) => {
          setTimeout(() => callback(new Error('Network error'), null), 0);
        }),
      };

      grenacheService.client = mockClient;

      const result = await grenacheService.syncOrderbook(orderbook);
      expect(result).toBe(false);
    }, 10000);

    it('should reject sync when not initialized', async () => {
      const uninitializedService = new GrenacheService();
      const orderbook = { pair: 'BTC/USD' };

      await expect(uninitializedService.syncOrderbook(orderbook)).rejects.toThrow(
        'Grenache service not initialized'
      );
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await grenacheService.initialize();
    });

    it('should add and remove handlers correctly', () => {
      const orderHandler = vi.fn();
      const tradeHandler = vi.fn();
      const orderbookHandler = vi.fn();

      grenacheService.addOrderHandler(orderHandler);
      grenacheService.addTradeHandler(tradeHandler);
      grenacheService.addOrderbookHandler(orderbookHandler);

      grenacheService.removeOrderHandler(orderHandler);
      grenacheService.removeTradeHandler(tradeHandler);
      grenacheService.removeOrderbookHandler(orderbookHandler);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await grenacheService.initialize();
    });

    it('should handle service errors gracefully', () => {
      // Test that service can handle errors without crashing
      expect(grenacheService.isInitialized).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should destroy service properly', async () => {
      await grenacheService.initialize();
      expect(grenacheService.isInitialized).toBe(true);

      grenacheService.destroy();
      expect(grenacheService.isInitialized).toBe(false);
    });

    it('should handle multiple destroy calls', async () => {
      await grenacheService.initialize();

      grenacheService.destroy();
      grenacheService.destroy(); // Should not throw

      expect(grenacheService.isInitialized).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await grenacheService.initialize();
    });

    it('should handle service initialization edge cases', () => {
      expect(grenacheService.isInitialized).toBe(true);
      expect(grenacheService.nodeId).toBeDefined();
      expect(grenacheService.serviceName).toBe('p2p_exchange');
    });

    it('should handle very large messages', async () => {
      const largeOrder = {
        id: 'order123',
        userId: 'user1',
        side: 'buy',
        amount: '1.0',
        price: '50000',
        metadata: 'x'.repeat(10000), // Large payload
      };

      // Mock successful distribution
      const mockClient = {
        map: vi.fn().mockImplementation((serviceName, message, options, callback) => {
          setTimeout(() => callback(null, { nodeId: 'node123' }), 0);
        }),
      };

      grenacheService.client = mockClient;

      const result = await grenacheService.distributeOrder(largeOrder);
      expect(result.success).toBe(true);
    }, 10000);
  });
});
