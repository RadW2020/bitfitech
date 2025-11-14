/**
 * Message Router
 *
 * Intelligent message routing with fallback strategies:
 * 1. Try direct P2P connection (primary)
 * 2. Try Grenache DHT (fallback, if available)
 * 3. Queue for later delivery
 */

import EventEmitter from 'events';
import { MessageType } from './peer-protocol.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MessageRouter');

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
 * Message router class
 */
export class MessageRouter extends EventEmitter {
  #directConnectionService;
  #grenacheService;
  #peerManager;
  #messageQueue;
  #maxQueueSize;
  #maxRetries;
  #retryDelay;
  #queueProcessor;
  #deduplicationCache;
  #deduplicationCacheSize;

  /**
   * Create message router instance
   * @param {Object} directConnectionService - Direct connection service
   * @param {Object} peerManager - Peer manager
   * @param {Object} options - Configuration options
   */
  constructor(directConnectionService, peerManager, options = {}) {
    super();

    this.#directConnectionService = directConnectionService;
    this.#grenacheService = options.grenacheService || null;
    this.#peerManager = peerManager;
    this.#messageQueue = [];
    this.#maxQueueSize = options.maxQueueSize || 1000;
    this.#maxRetries = options.maxRetries || 3;
    this.#retryDelay = options.retryDelay || 5000;
    this.#queueProcessor = null;
    this.#deduplicationCache = new Map();
    this.#deduplicationCacheSize = options.deduplicationCacheSize || 10000;
  }

  /**
   * Start message router
   */
  start() {
    logger.info('Starting message router');

    // Start queue processor
    this.#queueProcessor = setInterval(() => {
      this.#processQueue();
    }, this.#retryDelay);

    logger.info('Message router started');
  }

  /**
   * Stop message router
   */
  stop() {
    logger.info('Stopping message router');

    if (this.#queueProcessor) {
      clearInterval(this.#queueProcessor);
      this.#queueProcessor = null;
    }

    // Clear queue
    this.#messageQueue = [];

    logger.info('Message router stopped');
  }

  /**
   * Send message to a specific peer
   * @param {string} peerId - Peer identifier
   * @param {Object} message - Message to send
   * @returns {Promise<void>}
   */
  async sendToPeer(peerId, message) {
    // Try direct connection first
    if (this.#directConnectionService.isConnected(peerId)) {
      try {
        await this.#directConnectionService.sendMessage(peerId, message);
        logger.debug('Message sent via direct connection', { peerId, type: message.type });
        return;
      } catch (err) {
        logger.warn('Direct connection failed, trying fallback', {
          peerId,
          error: err.message,
        });
      }
    }

    // Try Grenache fallback
    if (this.#grenacheService) {
      try {
        await this.#sendViaGrenache(peerId, message);
        logger.debug('Message sent via Grenache', { peerId, type: message.type });
        return;
      } catch (err) {
        logger.warn('Grenache send failed', { peerId, error: err.message });
      }
    }

    // Queue for later delivery
    this.#queueMessage(peerId, message);
    logger.debug('Message queued for later delivery', { peerId, type: message.type });
  }

  /**
   * Broadcast message to all peers
   * @param {Object} message - Message to broadcast
   * @returns {Promise<Object>} Broadcast results
   */
  async broadcast(message) {
    const results = {
      direct: [],
      grenache: null,
      queued: [],
      errors: [],
    };

    // Check for duplicates
    const messageHash = this.#hashMessage(message);
    if (this.#isDuplicate(messageHash)) {
      logger.debug('Duplicate message detected, skipping broadcast', { hash: messageHash });
      return results;
    }

    // Mark as seen
    this.#markSeen(messageHash);

    // Broadcast via direct connections
    const connectedPeers = this.#peerManager.getHealthyPeers();

    for (const peer of connectedPeers) {
      try {
        await this.#directConnectionService.sendMessage(peer.nodeId, message);
        results.direct.push(peer.nodeId);
      } catch (err) {
        logger.debug('Direct broadcast failed to peer', {
          peerId: peer.nodeId,
          error: err.message,
        });
        results.errors.push({ peerId: peer.nodeId, error: err.message });
      }
    }

    // Also send via Grenache (if available) for redundancy
    if (this.#grenacheService) {
      try {
        await this.#broadcastViaGrenache(message);
        results.grenache = 'sent';
      } catch (err) {
        logger.debug('Grenache broadcast failed', { error: err.message });
        results.grenache = 'failed';
      }
    }

    logger.info('Broadcast complete', {
      type: message.type,
      direct: results.direct.length,
      grenache: results.grenache,
      errors: results.errors.length,
    });

    return results;
  }

  /**
   * Route message intelligently
   * @param {Object} message - Message to route
   * @returns {Promise<void>}
   */
  async route(message) {
    // Determine routing based on message type
    switch (message.type) {
      case MessageType.ORDER:
      case MessageType.TRADE:
      case MessageType.CANCEL_ORDER:
        // Broadcast to all peers
        return this.broadcast(message);

      case MessageType.PEER_EXCHANGE:
      case MessageType.PEER_EXCHANGE_REQUEST:
        // Send to specific peer if specified
        if (message.to) {
          return this.sendToPeer(message.to, message);
        }
        break;

      default:
        // Unknown message type, try broadcast
        logger.warn('Unknown message type, broadcasting', { type: message.type });
        return this.broadcast(message);
    }
  }

  /**
   * Send message via Grenache
   * @private
   * @param {string} peerId - Peer identifier
   * @param {Object} message - Message
   * @returns {Promise<void>}
   */
  async #sendViaGrenache(peerId, message) {
    if (!this.#grenacheService) {
      throw new Error('Grenache service not available');
    }

    // Note: Actual implementation depends on GrenacheService API
    // This is a placeholder
    logger.debug('Sending via Grenache', { peerId, type: message.type });

    // The actual Grenache service should have a method to send to specific peer
    // For now, we'll emit an event that can be handled by the integration layer
    this.emit('grenache:send', { peerId, message });
  }

  /**
   * Broadcast message via Grenache
   * @private
   * @param {Object} message - Message
   * @returns {Promise<void>}
   */
  async #broadcastViaGrenache(message) {
    if (!this.#grenacheService) {
      throw new Error('Grenache service not available');
    }

    logger.debug('Broadcasting via Grenache', { type: message.type });

    // Emit event for integration layer to handle
    this.emit('grenache:broadcast', { message });
  }

  /**
   * Queue message for later delivery
   * @private
   * @param {string} peerId - Peer identifier
   * @param {Object} message - Message
   */
  #queueMessage(peerId, message) {
    if (this.#messageQueue.length >= this.#maxQueueSize) {
      logger.warn('Message queue full, dropping oldest message');
      this.#messageQueue.shift();
    }

    this.#messageQueue.push(new QueuedMessage(peerId, message));
    logger.debug('Message queued', { peerId, queueSize: this.#messageQueue.length });
  }

  /**
   * Process message queue
   * @private
   */
  async #processQueue() {
    if (this.#messageQueue.length === 0) {
      return;
    }

    logger.debug('Processing message queue', { size: this.#messageQueue.length });

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
        logger.warn('Max retries exceeded, dropping message', {
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
        logger.info('Queued message delivered', {
          peerId: queuedMsg.peerId,
          attempts: queuedMsg.attempts,
        });
        toRemove.push(index);
      } catch (err) {
        logger.debug('Queued message retry failed', {
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
    // Simple hash based on message content
    const content = JSON.stringify({
      type: message.type,
      nodeId: message.nodeId,
      timestamp: message.timestamp,
      // Include type-specific fields
      orderId: message.order?.id,
      tradeId: message.trade?.id,
    });

    // Simple hash function (could use crypto.createHash for better hash)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
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
    // Add to cache with expiration
    this.#deduplicationCache.set(hash, Date.now());

    // Cleanup old entries if cache is too large
    if (this.#deduplicationCache.size > this.#deduplicationCacheSize) {
      const now = Date.now();
      const expirationTime = 60000; // 1 minute

      for (const [key, timestamp] of this.#deduplicationCache.entries()) {
        if (now - timestamp > expirationTime) {
          this.#deduplicationCache.delete(key);
        }
      }

      // If still too large, remove oldest entries
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
      queueSize: this.#messageQueue.length,
      maxQueueSize: this.#maxQueueSize,
      deduplicationCacheSize: this.#deduplicationCache.size,
      hasGrenache: !!this.#grenacheService,
    };
  }

  /**
   * Clear message queue
   */
  clearQueue() {
    this.#messageQueue = [];
    logger.info('Message queue cleared');
  }
}
