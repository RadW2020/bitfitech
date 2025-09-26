/**
 * @fileoverview Node synchronization for distributed orderbook reconciliation
 * @author Raul JM
 */

import { VectorClock } from './vector-clock.js';
import { logger, LogLevel } from './logger.js';

/**
 * @typedef {Object} NodeState
 * @property {string} nodeId - Node identifier
 * @property {Object} orderbook - Orderbook snapshot
 * @property {Object} vectorClock - Vector clock state
 * @property {number} timestamp - State timestamp
 * @property {number} version - State version
 */

/**
 * @typedef {Object} SyncResult
 * @property {boolean} success - Sync success
 * @property {string[]} conflicts - Conflict descriptions
 * @property {Object} mergedState - Merged state
 * @property {number} operationsApplied - Number of operations applied
 */

/**
 * Node synchronization manager for distributed orderbook reconciliation
 */
export class NodeSync {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.logger = logger.child({
      component: 'NodeSync',
      nodeId: this.nodeId,
    });

    // Sync configuration
    this.syncInterval = 30000; // 30 seconds
    this.conflictResolution = 'vector-clock'; // 'vector-clock', 'timestamp', 'manual'
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds

    // State tracking
    this.lastSyncTime = 0;
    this.syncInProgress = false;
    this.pendingSyncs = new Map();
    this.nodeStates = new Map();

    // Event handlers
    this.syncHandlers = new Set();
    this.conflictHandlers = new Set();
  }

  /**
   * Add sync event handler
   * @param {Function} handler - Sync handler function
   */
  onSync(handler) {
    this.syncHandlers.add(handler);
  }

  /**
   * Add conflict resolution handler
   * @param {Function} handler - Conflict handler function
   */
  onConflict(handler) {
    this.conflictHandlers.add(handler);
  }

  /**
   * Start periodic synchronization
   * @param {Function} getNodeState - Function to get current node state
   * @param {Function} getActiveNodes - Function to get active nodes
   * @param {Function} sendSyncRequest - Function to send sync request
   */
  startPeriodicSync(getNodeState, getActiveNodes, sendSyncRequest) {
    this.getNodeState = getNodeState;
    this.getActiveNodes = getActiveNodes;
    this.sendSyncRequest = sendSyncRequest;

    setInterval(async () => {
      if (!this.syncInProgress) {
        await this.performSync();
      }
    }, this.syncInterval);

    this.logger.system(LogLevel.INFO, 'Periodic sync started', {
      interval: this.syncInterval,
      nodeId: this.nodeId,
    });
  }

  /**
   * Perform synchronization with all active nodes
   * @returns {Promise<SyncResult>} Sync result
   */
  async performSync() {
    if (this.syncInProgress) {
      this.logger.system(LogLevel.WARN, 'Sync already in progress', {
        nodeId: this.nodeId,
      });
      return { success: false, conflicts: ['Sync in progress'] };
    }

    this.syncInProgress = true;
    this.lastSyncTime = Date.now();

    try {
      const activeNodes = await this.getActiveNodes();
      const currentNodeState = await this.getNodeState();

      this.logger.system(LogLevel.INFO, 'Starting sync with nodes', {
        nodeId: this.nodeId,
        activeNodes: activeNodes.length,
        currentNodeState: {
          orderCount: currentNodeState.orderbook?.orderCount || 0,
          tradeCount: currentNodeState.orderbook?.tradeCount || 0,
        },
      });

      const syncResults = await Promise.allSettled(
        activeNodes.map(nodeId => this.syncWithNode(nodeId, currentNodeState))
      );

      const successfulSyncs = syncResults.filter(r => r.status === 'fulfilled').length;
      const failedSyncs = syncResults.filter(r => r.status === 'rejected').length;

      this.logger.system(LogLevel.INFO, 'Sync completed', {
        nodeId: this.nodeId,
        successfulSyncs,
        failedSyncs,
        totalNodes: activeNodes.length,
      });

      // Notify sync handlers
      this.syncHandlers.forEach(handler => {
        try {
          handler({
            nodeId: this.nodeId,
            successfulSyncs,
            failedSyncs,
            totalNodes: activeNodes.length,
          });
        } catch (error) {
          this.logger.error(LogLevel.ERROR, 'Error in sync handler', error);
        }
      });

      return {
        success: successfulSyncs > 0,
        conflicts: [],
        mergedState: currentNodeState,
        operationsApplied: successfulSyncs,
      };
    } catch (error) {
      this.logger.error(LogLevel.ERROR, 'Sync failed', error, {
        nodeId: this.nodeId,
      });
      return {
        success: false,
        conflicts: [error.message],
        mergedState: null,
        operationsApplied: 0,
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync with a specific node
   * @param {string} nodeId - Target node ID
   * @param {NodeState} currentNodeState - Current node state
   * @returns {Promise<SyncResult>} Sync result
   */
  async syncWithNode(nodeId, currentNodeState) {
    try {
      // Send sync request
      const remoteState = await this.sendSyncRequest(nodeId, currentNodeState);

      if (!remoteState) {
        throw new Error(`No response from node ${nodeId}`);
      }

      // Compare states and resolve conflicts
      const conflicts = this.detectConflicts(currentNodeState, remoteState);

      if (conflicts.length > 0) {
        this.logger.system(LogLevel.WARN, 'Conflicts detected', {
          nodeId: this.nodeId,
          remoteNodeId: nodeId,
          conflicts: conflicts.length,
        });

        // Notify conflict handlers
        this.conflictHandlers.forEach(handler => {
          try {
            handler({
              nodeId: this.nodeId,
              remoteNodeId: nodeId,
              conflicts,
              localState: currentNodeState,
              remoteState,
            });
          } catch (error) {
            this.logger.error(LogLevel.ERROR, 'Error in conflict handler', error);
          }
        });
      }

      // Merge states
      const mergedState = this.mergeStates(currentNodeState, remoteState);

      // Store remote state
      this.nodeStates.set(nodeId, {
        ...remoteState,
        lastSync: Date.now(),
      });

      return {
        success: true,
        conflicts,
        mergedState,
        operationsApplied: conflicts.length,
      };
    } catch (error) {
      this.logger.error(LogLevel.ERROR, `Sync with node ${nodeId} failed`, error);
      throw error;
    }
  }

  /**
   * Detect conflicts between two node states
   * @param {NodeState} localState - Local node state
   * @param {NodeState} remoteState - Remote node state
   * @returns {string[]} Conflict descriptions
   */
  detectConflicts(localState, remoteState) {
    const conflicts = [];

    // Compare vector clocks
    const localClock = new VectorClock(this.nodeId, localState.vectorClock);
    const remoteClock = new VectorClock(remoteState.nodeId, remoteState.vectorClock);

    if (localClock.isConcurrent(remoteClock)) {
      conflicts.push('Concurrent vector clocks detected');
    }

    // Compare orderbook states
    const localOrderbook = localState.orderbook;
    const remoteOrderbook = remoteState.orderbook;

    if (localOrderbook.orderCount !== remoteOrderbook.orderCount) {
      conflicts.push(
        `Order count mismatch: local=${localOrderbook.orderCount}, remote=${remoteOrderbook.orderCount}`
      );
    }

    if (localOrderbook.tradeCount !== remoteOrderbook.tradeCount) {
      conflicts.push(
        `Trade count mismatch: local=${localOrderbook.tradeCount}, remote=${remoteOrderbook.tradeCount}`
      );
    }

    // Compare specific orders
    const localOrders = localOrderbook.orders || [];
    const remoteOrders = remoteOrderbook.orders || [];

    const localOrderIds = new Set(localOrders.map(o => o.id));
    const remoteOrderIds = new Set(remoteOrders.map(o => o.id));

    // Find missing orders
    for (const orderId of remoteOrderIds) {
      if (!localOrderIds.has(orderId)) {
        conflicts.push(`Missing order: ${orderId}`);
      }
    }

    for (const orderId of localOrderIds) {
      if (!remoteOrderIds.has(orderId)) {
        conflicts.push(`Extra order: ${orderId}`);
      }
    }

    return conflicts;
  }

  /**
   * Merge two node states
   * @param {NodeState} localState - Local node state
   * @param {NodeState} remoteState - Remote node state
   * @param {string[]} conflicts - Detected conflicts
   * @returns {NodeState} Merged state
   */
  mergeStates(localState, remoteState) {
    const localClock = new VectorClock(this.nodeId, localState.vectorClock);
    const remoteClock = new VectorClock(remoteState.nodeId, remoteState.vectorClock);

    // Merge vector clocks
    localClock.update(remoteClock);

    // Merge orderbooks based on conflict resolution strategy
    let mergedOrderbook;

    switch (this.conflictResolution) {
    case 'vector-clock':
      mergedOrderbook = this.mergeByVectorClock(
        localState.orderbook,
        remoteState.orderbook,
        localClock,
        remoteClock
      );
      break;
    case 'timestamp':
      mergedOrderbook = this.mergeByTimestamp(localState.orderbook, remoteState.orderbook);
      break;
    default:
      mergedOrderbook = localState.orderbook; // Keep local state
    }

    return {
      nodeId: this.nodeId,
      orderbook: mergedOrderbook,
      vectorClock: localClock.toObject(),
      timestamp: Date.now(),
      version: Math.max(localState.version || 0, remoteState.version || 0) + 1,
    };
  }

  /**
   * Merge orderbooks by vector clock priority
   * @param {Object} localOrderbook - Local orderbook
   * @param {Object} remoteOrderbook - Remote orderbook
   * @param {VectorClock} localClock - Local vector clock
   * @param {VectorClock} remoteClock - Remote vector clock
   * @returns {Object} Merged orderbook
   */
  mergeByVectorClock(localOrderbook, remoteOrderbook, localClock, remoteClock) {
    // If local clock is greater, keep local state
    if (localClock.happensAfter(remoteClock)) {
      return localOrderbook;
    }

    // If remote clock is greater, use remote state
    if (remoteClock.happensAfter(localClock)) {
      return remoteOrderbook;
    }

    // If concurrent, merge orders by timestamp
    return this.mergeByTimestamp(localOrderbook, remoteOrderbook);
  }

  /**
   * Merge orderbooks by timestamp
   * @param {Object} localOrderbook - Local orderbook
   * @param {Object} remoteOrderbook - Remote orderbook
   * @returns {Object} Merged orderbook
   */
  mergeByTimestamp(localOrderbook, remoteOrderbook) {
    const localOrders = localOrderbook.orders || [];
    const remoteOrders = remoteOrderbook.orders || [];

    // Combine and deduplicate orders
    const allOrders = [...localOrders, ...remoteOrders];
    const orderMap = new Map();

    allOrders.forEach(order => {
      if (!orderMap.has(order.id) || order.timestamp > orderMap.get(order.id).timestamp) {
        orderMap.set(order.id, order);
      }
    });

    const mergedOrders = Array.from(orderMap.values());

    return {
      ...localOrderbook,
      orders: mergedOrders,
      orderCount: mergedOrders.length,
      tradeCount: Math.max(localOrderbook.tradeCount || 0, remoteOrderbook.tradeCount || 0),
    };
  }

  /**
   * Get sync status
   * @returns {Object} Sync status
   */
  getStatus() {
    return {
      nodeId: this.nodeId,
      syncInProgress: this.syncInProgress,
      lastSyncTime: this.lastSyncTime,
      syncInterval: this.syncInterval,
      conflictResolution: this.conflictResolution,
      nodeStates: Array.from(this.nodeStates.keys()),
    };
  }

  /**
   * Stop synchronization
   */
  stop() {
    this.syncInProgress = false;
    this.syncHandlers.clear();
    this.conflictHandlers.clear();
    this.nodeStates.clear();

    this.logger.system(LogLevel.INFO, 'Node sync stopped', {
      nodeId: this.nodeId,
    });
  }
}
