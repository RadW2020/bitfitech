/**
 * @fileoverview Unit tests for Node Synchronization
 * @author Raul JM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeSync } from '../../src/utils/node-sync.js';

describe('NodeSync', () => {
  let nodeSync;
  let mockGetNodeState;
  let mockGetActiveNodes;
  let mockSendSyncRequest;

  beforeEach(() => {
    nodeSync = new NodeSync('test-node');

    mockGetNodeState = vi.fn().mockResolvedValue({
      nodeId: 'test-node',
      orderbook: {
        orderCount: 5,
        tradeCount: 3,
        orders: [
          { id: 'order1', amount: '100', price: '50000' },
          { id: 'order2', amount: '200', price: '51000' },
        ],
      },
      vectorClock: { 'test-node': 10 },
      timestamp: Date.now(),
      version: 1,
    });

    mockGetActiveNodes = vi.fn().mockResolvedValue(['node1', 'node2']);

    mockSendSyncRequest = vi.fn().mockResolvedValue({
      nodeId: 'node1',
      orderbook: {
        orderCount: 3,
        tradeCount: 2,
        orders: [{ id: 'order3', amount: '150', price: '52000' }],
      },
      vectorClock: { node1: 8 },
      timestamp: Date.now(),
      version: 1,
    });
  });

  describe('constructor', () => {
    it('should create node sync with node ID', () => {
      expect(nodeSync.nodeId).toBe('test-node');
      expect(nodeSync.syncInterval).toBe(30000);
      expect(nodeSync.conflictResolution).toBe('vector-clock');
    });
  });

  describe('onSync', () => {
    it('should add sync handler', () => {
      const handler = vi.fn();
      nodeSync.onSync(handler);
      expect(nodeSync.syncHandlers.has(handler)).toBe(true);
    });
  });

  describe('onConflict', () => {
    it('should add conflict handler', () => {
      const handler = vi.fn();
      nodeSync.onConflict(handler);
      expect(nodeSync.conflictHandlers.has(handler)).toBe(true);
    });
  });

  describe('startPeriodicSync', () => {
    it('should start periodic sync', () => {
      nodeSync.startPeriodicSync(mockGetNodeState, mockGetActiveNodes, mockSendSyncRequest);

      expect(nodeSync.getNodeState).toBe(mockGetNodeState);
      expect(nodeSync.getActiveNodes).toBe(mockGetActiveNodes);
      expect(nodeSync.sendSyncRequest).toBe(mockSendSyncRequest);
    });
  });

  describe('performSync', () => {
    beforeEach(() => {
      nodeSync.startPeriodicSync(mockGetNodeState, mockGetActiveNodes, mockSendSyncRequest);
    });

    it('should perform sync with active nodes', async () => {
      const result = await nodeSync.performSync();

      expect(result.success).toBe(true);
      expect(result.operationsApplied).toBe(2);
      expect(mockGetActiveNodes).toHaveBeenCalled();
      expect(mockSendSyncRequest).toHaveBeenCalledTimes(2);
    });

    it('should handle sync errors gracefully', async () => {
      mockSendSyncRequest.mockRejectedValue(new Error('Sync failed'));

      const result = await nodeSync.performSync();

      expect(result.success).toBe(false);
      expect(result.conflicts).toContain('Sync failed');
    });

    it('should not sync if already in progress', async () => {
      nodeSync.syncInProgress = true;

      const result = await nodeSync.performSync();

      expect(result.success).toBe(false);
      expect(result.conflicts).toContain('Sync in progress');
    });
  });

  describe('syncWithNode', () => {
    beforeEach(() => {
      nodeSync.startPeriodicSync(mockGetNodeState, mockGetActiveNodes, mockSendSyncRequest);
    });

    it('should sync with specific node', async () => {
      const currentNodeState = await mockGetNodeState();

      const result = await nodeSync.syncWithNode('node1', currentNodeState);

      expect(result.success).toBe(true);
      expect(mockSendSyncRequest).toHaveBeenCalledWith('node1', currentNodeState);
    });

    it('should detect conflicts', async () => {
      const currentNodeState = await mockGetNodeState();

      const result = await nodeSync.syncWithNode('node1', currentNodeState);

      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('detectConflicts', () => {
    it('should detect order count mismatch', () => {
      const localState = {
        orderbook: { orderCount: 5, tradeCount: 3, orders: [] },
        vectorClock: { 'test-node': 10 },
      };

      const remoteState = {
        nodeId: 'node1',
        orderbook: { orderCount: 3, tradeCount: 2, orders: [] },
        vectorClock: { node1: 8 },
      };

      const conflicts = nodeSync.detectConflicts(localState, remoteState);

      expect(conflicts).toContain('Order count mismatch: local=5, remote=3');
    });

    it('should detect missing orders', () => {
      const localState = {
        orderbook: {
          orderCount: 2,
          tradeCount: 0,
          orders: [
            { id: 'order1', amount: '100', price: '50000' },
            { id: 'order2', amount: '200', price: '51000' },
          ],
        },
        vectorClock: { 'test-node': 10 },
      };

      const remoteState = {
        nodeId: 'node1',
        orderbook: {
          orderCount: 1,
          tradeCount: 0,
          orders: [{ id: 'order3', amount: '150', price: '52000' }],
        },
        vectorClock: { node1: 8 },
      };

      const conflicts = nodeSync.detectConflicts(localState, remoteState);

      expect(conflicts).toContain('Missing order: order3');
      expect(conflicts).toContain('Extra order: order1');
      expect(conflicts).toContain('Extra order: order2');
    });
  });

  describe('mergeStates', () => {
    it('should merge states by vector clock', () => {
      const localState = {
        orderbook: { orderCount: 5, tradeCount: 3, orders: [] },
        vectorClock: { 'test-node': 10 },
        version: 1,
      };

      const remoteState = {
        nodeId: 'node1',
        orderbook: { orderCount: 3, tradeCount: 2, orders: [] },
        vectorClock: { node1: 8 },
        version: 1,
      };

      const conflicts = ['Order count mismatch'];
      const mergedState = nodeSync.mergeStates(localState, remoteState, conflicts);

      expect(mergedState.nodeId).toBe('test-node');
      expect(mergedState.version).toBe(2);
      expect(mergedState.vectorClock).toBeDefined();
    });
  });

  describe('mergeByVectorClock', () => {
    it('should merge by vector clock priority', () => {
      const localOrderbook = { orderCount: 5, tradeCount: 3, orders: [] };
      const remoteOrderbook = { orderCount: 3, tradeCount: 2, orders: [] };

      // Mock vector clocks
      const localClock = { happensAfter: vi.fn().mockReturnValue(true) };
      const remoteClock = { happensAfter: vi.fn().mockReturnValue(false) };

      const result = nodeSync.mergeByVectorClock(
        localOrderbook,
        remoteOrderbook,
        localClock,
        remoteClock
      );

      expect(result).toBe(localOrderbook);
    });
  });

  describe('mergeByTimestamp', () => {
    it('should merge orders by timestamp', () => {
      const localOrderbook = {
        orderCount: 2,
        tradeCount: 1,
        orders: [
          { id: 'order1', amount: '100', price: '50000', timestamp: 1000 },
          { id: 'order2', amount: '200', price: '51000', timestamp: 2000 },
        ],
      };

      const remoteOrderbook = {
        orderCount: 1,
        tradeCount: 2,
        orders: [
          { id: 'order1', amount: '150', price: '52000', timestamp: 1500 }, // Newer version
        ],
      };

      const result = nodeSync.mergeByTimestamp(localOrderbook, remoteOrderbook);

      expect(result.orderCount).toBe(2);
      expect(result.tradeCount).toBe(2);
      expect(result.orders).toHaveLength(2);

      // Check that newer version of order1 is kept
      const order1 = result.orders.find(o => o.id === 'order1');
      expect(order1.amount).toBe('150');
      expect(order1.price).toBe('52000');
    });
  });

  describe('getStatus', () => {
    it('should return sync status', () => {
      const status = nodeSync.getStatus();

      expect(status).toHaveProperty('nodeId', 'test-node');
      expect(status).toHaveProperty('syncInProgress', false);
      expect(status).toHaveProperty('lastSyncTime', 0);
      expect(status).toHaveProperty('syncInterval', 30000);
      expect(status).toHaveProperty('conflictResolution', 'vector-clock');
      expect(status).toHaveProperty('nodeStates', []);
    });
  });

  describe('stop', () => {
    it('should stop synchronization', () => {
      const syncHandler = vi.fn();
      const conflictHandler = vi.fn();

      nodeSync.onSync(syncHandler);
      nodeSync.onConflict(conflictHandler);

      nodeSync.stop();

      expect(nodeSync.syncInProgress).toBe(false);
      expect(nodeSync.syncHandlers.size).toBe(0);
      expect(nodeSync.conflictHandlers.size).toBe(0);
      expect(nodeSync.nodeStates.size).toBe(0);
    });
  });
});
