/**
 * Message Router - Pure P2P
 *
 * Direct peer-to-peer message routing with intelligent broadcast.
 * NO fallbacks, NO alternative strategies - just direct TCP connections.
 */

import EventEmitter from 'events';
import { MessageType } from './peer-protocol.js';
import { logger, LogLevel } from '../utils/logger.js';

/**
 * Message queue entry
 */
class QueuedMessage {
  constructor(peerId, message, attempts = 0) {
    this.peerId = peerId;
    this.message = message;
    this.attempts = attempts;
    this.queuedAt = Date.now();
    this.lastAttempt = null;
  }
}

/**
 * Pure P2P Message Router
 * Routes messages via direct TCP connections only
 */
export class MessageRouter extends EventEmitter {
  #directConnectionService;
  #peerManager;
  #messageQueue;
  #maxQueueSize;
  #maxRetries;
  #retryDelay;
  #queueProcessor;
  #deduplicationCache;
  #deduplicationCacheSize;
  #logger;

  /**
   * Create message router instance
   * @param {Object} directConnectionService - Direct connection service
   * @param {Object} peerManager - Peer manager
   * @param {Object} options - Configuration options
   */
  constructor(directConnectionService, peerManager, options = {}) {
    super();

    this.#directConnectionService = directConnectionService;
    this.#peerManager = peerManager;
    this.#messageQueue = [];
    this.#maxQueueSize = options.maxQueueSize || 1000;
    this.#maxRetries = options.maxRetries || 3;
    this.#retryDelay = options.retryDelay || 5000;
    this.#queueProcessor = null;
    this.#deduplicationCache = new Map();
    this.#deduplicationCacheSize = options.deduplicationCacheSize || 10000;
    this.#logger = logger.child({
      component: 'MessageRouter',
    });
  }

  /**
   * Start message router
   */
  start() {
    this.#logger.system(LogLevel.INFO, 'Starting pure P2P message router');

    // Start queue processor
    this.#queueProcessor = setInterval(() => {
      this.#processQueue();
    }, this.#retryDelay);

    this.#logger.system(LogLevel.INFO, 'Pure P2P message router started');
  }

  /**
   * Stop message router
   */
  stop() {
    this.#logger.system(LogLevel.INFO, 'Stopping message router');

    if (this.#queueProcessor) {
      clearInterval(this.#queueProcessor);
      this.#queueProcessor = null;
    }

    // Clear queue
    this.#messageQueue = [];

    this.#logger.system(LogLevel.INFO, 'Message router stopped');
  }

  /**
   * Send message to a specific peer via direct P2P connection
   * @param {string} peerId - Peer identifier
   * @param {Object} message - Message to send
   * @returns {Promise<void>}
   */
  async sendToPeer(peerId, message) {
    // Direct P2P connection only - no fallbacks
    if (this.#directConnectionService.isConnected(peerId)) {
      try {
        await this.#directConnectionService.sendMessage(peerId, message);
        this.#logger.system(LogLevel.DEBUG, 'Message sent via direct P2P', { peerId, type: message.type });
        return;
      } catch (err) {
        this.#logger.system(LogLevel.WARN, 'Direct P2P send failed, queuing', {
          peerId,
          error: err.message,
        });
      }
    }

    // Queue for retry when peer reconnects
    this.#queueMessage(peerId, message);
    this.#logger.system(LogLevel.DEBUG, 'Message queued for later delivery', { peerId, type: message.type });
  }

  /**
   * Broadcast message to all connected peers via direct P2P
   * @param {Object} message - Message to broadcast
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcast(message) {
    const results = {
      successful: [],
      failed: [],
      queued: [],
    };

    // Check for duplicates
    const messageHash = this.#hashMessage(message);
    if (this.#isDuplicate(messageHash)) {
      this.#logger.system(LogLevel.DEBUG, 'Duplicate message detected, skipping', { hash: messageHash });
      return results;
    }

    // Mark as seen
    this.#markSeen(messageHash);

    // Broadcast via direct P2P connections only
    const connectedPeers = this.#peerManager.getHealthyPeers();

    for (const peer of connectedPeers) {
      try {
        await this.#directConnectionService.sendMessage(peer.nodeId, message);
        results.successful.push(peer.nodeId);
      } catch (err) {
        this.#logger.system(LogLevel.DEBUG, 'P2P broadcast failed to peer', {
          peerId: peer.nodeId,
          error: err.message,
        });
        results.failed.push({ peerId: peer.nodeId, error: err.message });
      }
    }

    this.#logger.system(LogLevel.INFO, 'P2P broadcast complete', {
      type: message.type,
      successful: results.successful.length,
      failed: results.failed.length,
    });

    return results;
  }

  /**
   * Route message via direct P2P
   * @param {Object} message - Message to route
   * @returns {Promise<void>}
   */
  async route(message) {
    // All messages broadcast via direct P2P
    switch (message.type) {
      case MessageType.ORDER:
      case MessageType.TRADE:
      case MessageType.CANCEL_ORDER:
        return this.broadcast(message);

      case MessageType.PEER_EXCHANGE:
      case MessageType.PEER_EXCHANGE_REQUEST:
        if (message.to) {
          return this.sendToPeer(message.to, message);
        }
        break;

      default:
        this.#logger.system(LogLevel.WARN, 'Unknown message type', { type: message.type });
        return this.broadcast(message);
    }
  }

  /**
   * Queue message for later delivery
   * @private
   * @param {string} peerId - Peer identifier
   * @param {Object} message - Message
   */
  #queueMessage(peerId, message) {
    if (this.#messageQueue.length >= this.#maxQueueSize) {
      this.#logger.system(LogLevel.WARN, 'Message queue full, dropping oldest message');
      this.#messageQueue.shift();
    }

    this.#messageQueue.push(new QueuedMessage(peerId, message));
    this.#logger.system(LogLevel.DEBUG, 'Message queued', { peerId, queueSize: this.#messageQueue.length });
  }

  /**
   * Process message queue
   * @private
   */
  async #processQueue() {
    if (this.#messageQueue.length === 0) {
      return;
    }

    this.#logger.system(LogLevel.DEBUG, 'Processing message queue', { size: this.#messageQueue.length });

    const now = Date.now();
    const toRetry = [];
    const toRemove = [];

    for (let i = 0; i < this.#messageQueue.length; i++) {
      const queuedMsg = this.#messageQueue[i];

      // Check if it's time to retry
      if (queuedMsg.lastAttempt && now - queuedMsg.lastAttempt < this.#retryDelay) {
        continue;
      }

      // Check max retries
      if (queuedMsg.attempts >= this.#maxRetries) {
        this.#logger.system(LogLevel.WARN, 'Max retries exceeded, dropping message', {
          peerId: queuedMsg.peerId,
          attempts: queuedMsg.attempts,
        });
        toRemove.push(i);
        continue;
      }

      toRetry.push({ index: i, queuedMsg });
    }

    // Process retries
    for (const { index, queuedMsg } of toRetry) {
      queuedMsg.attempts++;
      queuedMsg.lastAttempt = now;

      try {
        await this.sendToPeer(queuedMsg.peerId, queuedMsg.message);
        this.#logger.system(LogLevel.INFO, 'Queued message delivered', {
          peerId: queuedMsg.peerId,
          attempts: queuedMsg.attempts,
        });
        toRemove.push(index);
      } catch (err) {
        this.#logger.system(LogLevel.DEBUG, 'Queued message retry failed', {
          peerId: queuedMsg.peerId,
          attempts: queuedMsg.attempts,
          error: err.message,
        });
      }
    }

    // Remove delivered/expired messages
    for (const index of toRemove.sort((a, b) => b - a)) {
      this.#messageQueue.splice(index, 1);
    }
  }

  /**
   * Hash message for deduplication
   * @private
   * @param {Object} message - Message
   * @returns {string} Message hash
   */
  #hashMessage(message) {
    const content = JSON.stringify({
      type: message.type,
      nodeId: message.nodeId,
      timestamp: message.timestamp,
      orderId: message.order?.id,
      tradeId: message.trade?.id,
    });

    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return hash.toString(36);
  }

  /**
   * Check if message is duplicate
   * @private
   * @param {string} hash - Message hash
   * @returns {boolean} True if duplicate
   */
  #isDuplicate(hash) {
    return this.#deduplicationCache.has(hash);
  }

  /**
   * Mark message as seen
   * @private
   * @param {string} hash - Message hash
   */
  #markSeen(hash) {
    this.#deduplicationCache.set(hash, Date.now());

    // Cleanup old entries
    if (this.#deduplicationCache.size > this.#deduplicationCacheSize) {
      const now = Date.now();
      const expirationTime = 60000; // 1 minute

      for (const [key, timestamp] of this.#deduplicationCache.entries()) {
        if (now - timestamp > expirationTime) {
          this.#deduplicationCache.delete(key);
        }
      }

      // If still too large, remove oldest
      if (this.#deduplicationCache.size > this.#deduplicationCacheSize) {
        const entries = Array.from(this.#deduplicationCache.entries());
        entries.sort((a, b) => a[1] - b[1]);

        const toRemove = entries.slice(0, entries.length - this.#deduplicationCacheSize);
        for (const [key] of toRemove) {
          this.#deduplicationCache.delete(key);
        }
      }
    }
  }

  /**
   * Get router statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      mode: 'Pure P2P',
      queueSize: this.#messageQueue.length,
      maxQueueSize: this.#maxQueueSize,
      deduplicationCacheSize: this.#deduplicationCache.size,
    };
  }

  /**
   * Clear message queue
   */
  clearQueue() {
    this.#messageQueue = [];
    this.#logger.system(LogLevel.INFO, 'Message queue cleared');
  }
}
