/**
 * Peer Storage
 *
 * Handles persistence of peer information to disk for reconnection
 * across application restarts.
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PeerStorage');

/**
 * Peer storage class
 */
export class PeerStorage {
  #filePath;
  #maxPeers;
  #saveDebounceTimer;
  #saveDebounceDelay;

  /**
   * Create peer storage instance
   * @param {string} filePath - Path to storage file
   * @param {number} maxPeers - Maximum peers to store
   * @param {number} saveDebounceDelay - Delay before saving (ms)
   */
  constructor(filePath = '.peers.json', maxPeers = 100, saveDebounceDelay = 5000) {
    this.#filePath = path.resolve(filePath);
    this.#maxPeers = maxPeers;
    this.#saveDebounceDelay = saveDebounceDelay;
    this.#saveDebounceTimer = null;
  }

  /**
   * Load peers from disk
   * @returns {Promise<Array>} Loaded peers
   */
  async load() {
    try {
      const data = await fs.readFile(this.#filePath, 'utf8');
      const parsed = JSON.parse(data);

      if (!this.#validateStorageFormat(parsed)) {
        logger.warn('Invalid peer storage format, ignoring file');
        return [];
      }

      const peers = parsed.peers || [];
      logger.info(`Loaded ${peers.length} peers from storage`);

      // Sort by lastSeen (most recent first)
      peers.sort((a, b) => b.lastSeen - a.lastSeen);

      // Filter out stale peers (older than 7 days)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const freshPeers = peers.filter((p) => p.lastSeen > sevenDaysAgo);

      if (freshPeers.length < peers.length) {
        logger.info(`Filtered out ${peers.length - freshPeers.length} stale peers`);
      }

      return freshPeers;
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.info('No peer storage file found, starting fresh');
        return [];
      }

      logger.error('Failed to load peers from storage', { error: err.message });
      return [];
    }
  }

  /**
   * Save peers to disk (debounced)
   * @param {Array} peers - Peers to save
   * @returns {Promise<void>}
   */
  async save(peers) {
    // Clear existing timer
    if (this.#saveDebounceTimer) {
      clearTimeout(this.#saveDebounceTimer);
    }

    // Schedule save
    return new Promise((resolve, reject) => {
      this.#saveDebounceTimer = setTimeout(async () => {
        try {
          await this.#performSave(peers);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, this.#saveDebounceDelay);
    });
  }

  /**
   * Save peers immediately (bypass debounce)
   * @param {Array} peers - Peers to save
   * @returns {Promise<void>}
   */
  async saveImmediate(peers) {
    if (this.#saveDebounceTimer) {
      clearTimeout(this.#saveDebounceTimer);
      this.#saveDebounceTimer = null;
    }

    await this.#performSave(peers);
  }

  /**
   * Perform the actual save operation
   * @private
   * @param {Array} peers - Peers to save
   * @returns {Promise<void>}
   */
  async #performSave(peers) {
    try {
      // Filter and prepare peers for storage
      const peersToStore = peers
        .filter((p) => this.#shouldStorePeer(p))
        .map((p) => this.#serializePeer(p))
        .slice(0, this.#maxPeers);

      const data = {
        version: '1.0.0',
        savedAt: new Date().toISOString(),
        savedTimestamp: Date.now(),
        peers: peersToStore,
      };

      const json = JSON.stringify(data, null, 2);

      // Write to temporary file first, then rename (atomic operation)
      const tempPath = `${this.#filePath}.tmp`;
      await fs.writeFile(tempPath, json, 'utf8');
      await fs.rename(tempPath, this.#filePath);

      logger.info(`Saved ${peersToStore.length} peers to storage`);
    } catch (err) {
      logger.error('Failed to save peers to storage', { error: err.message });
      throw err;
    }
  }

  /**
   * Determine if a peer should be stored
   * @private
   * @param {Object} peer - Peer to check
   * @returns {boolean} True if should store
   */
  #shouldStorePeer(peer) {
    // Only store peers that have been successfully connected
    if (!peer.lastSeen || !peer.nodeId || !peer.address || !peer.port) {
      return false;
    }

    // Don't store localhost peers (won't work after restart)
    if (peer.address === '127.0.0.1' || peer.address === 'localhost') {
      return false;
    }

    return true;
  }

  /**
   * Serialize peer for storage
   * @private
   * @param {Object} peer - Peer to serialize
   * @returns {Object} Serialized peer
   */
  #serializePeer(peer) {
    return {
      nodeId: peer.nodeId,
      address: peer.address,
      port: peer.port,
      lastSeen: peer.lastSeen,
      successfulConnections: peer.successfulConnections || 0,
      failedConnections: peer.failedConnections || 0,
      capabilities: peer.capabilities || {},
    };
  }

  /**
   * Validate storage file format
   * @private
   * @param {Object} data - Parsed storage data
   * @returns {boolean} True if valid
   */
  #validateStorageFormat(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }

    if (!data.version || !Array.isArray(data.peers)) {
      return false;
    }

    return true;
  }

  /**
   * Clear all stored peers
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await fs.unlink(this.#filePath);
      logger.info('Cleared peer storage');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.error('Failed to clear peer storage', { error: err.message });
        throw err;
      }
    }
  }

  /**
   * Get storage file path
   * @returns {string} File path
   */
  getFilePath() {
    return this.#filePath;
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage stats
   */
  async getStats() {
    try {
      const stats = await fs.stat(this.#filePath);
      const data = await fs.readFile(this.#filePath, 'utf8');
      const parsed = JSON.parse(data);

      return {
        exists: true,
        size: stats.size,
        modified: stats.mtime,
        peerCount: parsed.peers?.length || 0,
        savedAt: parsed.savedAt,
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        return {
          exists: false,
          size: 0,
          peerCount: 0,
        };
      }
      throw err;
    }
  }

  /**
   * Cleanup method for graceful shutdown
   * @param {Array} peers - Current peers to save
   * @returns {Promise<void>}
   */
  async cleanup(peers) {
    if (this.#saveDebounceTimer) {
      clearTimeout(this.#saveDebounceTimer);
      this.#saveDebounceTimer = null;
    }

    if (peers && peers.length > 0) {
      await this.#performSave(peers);
    }
  }
}
