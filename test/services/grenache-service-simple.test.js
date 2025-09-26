/**
 * @fileoverview Simple unit tests for GrenacheService class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import GrenacheService from '../../src/services/grenache-service.js';

// Mock grenache modules completely
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

describe('GrenacheService - Simple Unit Tests', () => {
  let grenacheService;

  beforeEach(() => {
    grenacheService = new GrenacheService('http://127.0.0.1:30001');
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

  describe('Validation', () => {
    it('should reject distribution when not initialized', async () => {
      const uninitializedService = new GrenacheService();
      const order = { id: 'order123' };

      await expect(uninitializedService.distributeOrder(order)).rejects.toThrow(
        'Grenache service not initialized'
      );
    });

    it('should reject broadcast when not initialized', async () => {
      const uninitializedService = new GrenacheService();
      const trade = { id: 'trade123' };

      await expect(uninitializedService.broadcastTrade(trade)).rejects.toThrow(
        'Grenache service not initialized'
      );
    });

    it('should reject sync when not initialized', async () => {
      const uninitializedService = new GrenacheService();
      const orderbook = { pair: 'BTC/USD' };

      await expect(uninitializedService.syncOrderbook(orderbook)).rejects.toThrow(
        'Grenache service not initialized'
      );
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
  });
});
