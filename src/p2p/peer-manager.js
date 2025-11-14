/**
 * Peer Manager
 *
 * Manages the state of all connected peers, health monitoring,
 * and peer lifecycle.
 */

import EventEmitter from 'events';
import { PeerStatus, ProtocolConstants } from './peer-protocol.js';
import { PeerStorage } from './peer-storage.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PeerManager');

/**
 * Peer manager class
 */
export class PeerManager extends EventEmitter {
  #nodeId;
  #peers;
  #peerStorage;
  #maxInboundPeers;
  #maxOutboundPeers;
  #heartbeatInterval;
  #heartbeatTimer;
  #reconnectTimer;

  /**
   * Create peer manager instance
   * @param {string} nodeId - This node's identifier
   * @param {Object} options - Configuration options
   */
  constructor(nodeId, options = {}) {
    super();

    this.#nodeId = nodeId;
    this.#peers = new Map();

    // Configuration
    this.#maxInboundPeers = options.maxInboundPeers || ProtocolConstants.MAX_INBOUND_CONNECTIONS;
    this.#maxOutboundPeers = options.maxOutboundPeers || ProtocolConstants.MAX_OUTBOUND_CONNECTIONS;
    this.#heartbeatInterval = options.heartbeatInterval || ProtocolConstants.HEARTBEAT_INTERVAL;

    // Peer storage
    const storagePath = options.peerStoragePath || '.peers.json';
    this.#peerStorage = new PeerStorage(storagePath);

    this.#heartbeatTimer = null;
    this.#reconnectTimer = null;
  }

  /**
   * Initialize peer manager
   * @returns {Promise<void>}
   */
  async initialize() {
    logger.info('Initializing peer manager', { nodeId: this.#nodeId });

    // Load persisted peers
    const persistedPeers = await this.#peerStorage.load();
    logger.info(`Loaded ${persistedPeers.length} persisted peers`);

    // Store as disconnected peers (will be reconnected later)
    for (const peerData of persistedPeers) {
      this.#peers.set(peerData.nodeId, {
        ...peerData,
        status: PeerStatus.DISCONNECTED,
        connection: null,
        inbound: false,
        reconnectAttempts: 0,
        createdAt: Date.now(),
      });
    }

    // Start background tasks
    this.#startHeartbeat();
    this.#startReconnection();

    logger.info('Peer manager initialized');
  }

  /**
   * Add a new peer
   * @param {Object} peerInfo - Peer information
   * @returns {boolean} True if added successfully
   */
  addPeer(peerInfo) {
    const { nodeId, address, port, connection, inbound = false } = peerInfo;

    // Don't add ourselves
    if (nodeId === this.#nodeId) {
      logger.debug('Ignoring self-connection');
      return false;
    }

    // Check connection limits
    if (inbound && this.#getInboundPeerCount() >= this.#maxInboundPeers) {
      logger.warn('Inbound peer limit reached', { limit: this.#maxInboundPeers });
      return false;
    }

    if (!inbound && this.#getOutboundPeerCount() >= this.#maxOutboundPeers) {
      logger.warn('Outbound peer limit reached', { limit: this.#maxOutboundPeers });
      return false;
    }

    // Check if peer already exists
    if (this.#peers.has(nodeId)) {
      const existing = this.#peers.get(nodeId);

      // Update if connecting or reconnecting
      if (existing.status === PeerStatus.DISCONNECTED || existing.status === PeerStatus.CONNECTING) {
        existing.connection = connection;
        existing.status = PeerStatus.CONNECTED;
        existing.address = address;
        existing.port = port;
        existing.inbound = inbound;
        existing.lastSeen = Date.now();
        existing.reconnectAttempts = 0;

        logger.info('Updated existing peer', { nodeId, address, port });
        this.emit('peer:updated', existing);
        return true;
      }

      logger.debug('Peer already connected', { nodeId });
      return false;
    }

    // Add new peer
    const peer = {
      nodeId,
      address,
      port,
      connection,
      status: PeerStatus.CONNECTED,
      inbound,
      lastSeen: Date.now(),
      lastHeartbeat: Date.now(),
      createdAt: Date.now(),
      reconnectAttempts: 0,
      capabilities: {},
      stats: {
        messagesReceived: 0,
        messagesSent: 0,
        bytesReceived: 0,
        bytesSent: 0,
      },
      successfulConnections: 1,
      failedConnections: 0,
    };

    this.#peers.set(nodeId, peer);

    logger.info('Added new peer', { nodeId, address, port, inbound });
    this.emit('peer:added', peer);

    // Persist peers (debounced)
    this.#persistPeers();

    return true;
  }

  /**
   * Remove a peer
   * @param {string} nodeId - Peer identifier
   * @param {string} reason - Removal reason
   * @returns {boolean} True if removed
   */
  removePeer(nodeId, reason = 'unknown') {
    const peer = this.#peers.get(nodeId);

    if (!peer) {
      return false;
    }

    // Close connection if exists
    if (peer.connection && !peer.connection.destroyed) {
      try {
        peer.connection.end();
      } catch (err) {
        logger.error('Error closing peer connection', { nodeId, error: err.message });
      }
    }

    // Mark as disconnected instead of removing (for reconnection)
    peer.status = PeerStatus.DISCONNECTED;
    peer.connection = null;
    peer.disconnectedAt = Date.now();
    peer.disconnectReason = reason;

    logger.info('Peer disconnected', { nodeId, reason });
    this.emit('peer:disconnected', peer);

    // Persist peers
    this.#persistPeers();

    return true;
  }

  /**
   * Get a specific peer
   * @param {string} nodeId - Peer identifier
   * @returns {Object|null} Peer or null
   */
  getPeer(nodeId) {
    return this.#peers.get(nodeId) || null;
  }

  /**
   * Get all peers
   * @param {Object} filter - Optional filter
   * @returns {Array} Array of peers
   */
  getAllPeers(filter = {}) {
    const peers = Array.from(this.#peers.values());

    if (filter.status) {
      return peers.filter((p) => p.status === filter.status);
    }

    if (filter.connected !== undefined) {
      return peers.filter((p) => {
        const isConnected = p.status === PeerStatus.CONNECTED || p.status === PeerStatus.AUTHENTICATED;
        return filter.connected ? isConnected : !isConnected;
      });
    }

    return peers;
  }

  /**
   * Get connected and healthy peers
   * @returns {Array} Healthy peers
   */
  getHealthyPeers() {
    const now = Date.now();
    const timeout = ProtocolConstants.HEARTBEAT_TIMEOUT;

    return this.getAllPeers({ connected: true }).filter((peer) => {
      return now - peer.lastHeartbeat < timeout;
    });
  }

  /**
   * Update peer capabilities
   * @param {string} nodeId - Peer identifier
   * @param {Object} capabilities - Capabilities object
   */
  updateCapabilities(nodeId, capabilities) {
    const peer = this.#peers.get(nodeId);

    if (!peer) {
      return;
    }

    peer.capabilities = { ...peer.capabilities, ...capabilities };
    this.emit('peer:capabilities', peer);
  }

  /**
   * Update peer heartbeat
   * @param {string} nodeId - Peer identifier
   */
  updateHeartbeat(nodeId) {
    const peer = this.#peers.get(nodeId);

    if (!peer) {
      return;
    }

    peer.lastHeartbeat = Date.now();
    peer.lastSeen = Date.now();
  }

  /**
   * Update peer statistics
   * @param {string} nodeId - Peer identifier
   * @param {Object} stats - Statistics update
   */
  updateStats(nodeId, stats) {
    const peer = this.#peers.get(nodeId);

    if (!peer) {
      return;
    }

    if (stats.messageReceived) {
      peer.stats.messagesReceived++;
      peer.stats.bytesReceived += stats.bytes || 0;
    }

    if (stats.messageSent) {
      peer.stats.messagesSent++;
      peer.stats.bytesSent += stats.bytes || 0;
    }

    peer.lastSeen = Date.now();
  }

  /**
   * Get peer count
   * @returns {number} Total peer count
   */
  getPeerCount() {
    return this.#peers.size;
  }

  /**
   * Get connected peer count
   * @returns {number} Connected peer count
   */
  getConnectedPeerCount() {
    return this.getAllPeers({ connected: true }).length;
  }

  /**
   * Get peers for sharing (peer exchange)
   * @param {number} maxPeers - Maximum peers to share
   * @returns {Array} Peers to share
   */
  getPeersForSharing(maxPeers = ProtocolConstants.MAX_PEERS_TO_SHARE) {
    const healthyPeers = this.getHealthyPeers();

    // Sort by successful connections (reputation)
    healthyPeers.sort((a, b) => {
      const scoreA = a.successfulConnections / Math.max(1, a.failedConnections + a.successfulConnections);
      const scoreB = b.successfulConnections / Math.max(1, b.failedConnections + b.successfulConnections);
      return scoreB - scoreA;
    });

    // Return peer info without connection objects
    return healthyPeers.slice(0, maxPeers).map((peer) => ({
      nodeId: peer.nodeId,
      address: peer.address,
      port: peer.port,
      capabilities: peer.capabilities,
    }));
  }

  /**
   * Get manager statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const peers = Array.from(this.#peers.values());

    return {
      totalPeers: peers.length,
      connectedPeers: this.getConnectedPeerCount(),
      healthyPeers: this.getHealthyPeers().length,
      inboundPeers: this.#getInboundPeerCount(),
      outboundPeers: this.#getOutboundPeerCount(),
      totalMessagesReceived: peers.reduce((sum, p) => sum + p.stats.messagesReceived, 0),
      totalMessagesSent: peers.reduce((sum, p) => sum + p.stats.messagesSent, 0),
      totalBytesReceived: peers.reduce((sum, p) => sum + p.stats.bytesReceived, 0),
      totalBytesSent: peers.reduce((sum, p) => sum + p.stats.bytesSent, 0),
    };
  }

  /**
   * Start heartbeat monitoring
   * @private
   */
  #startHeartbeat() {
    if (this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer);
    }

    this.#heartbeatTimer = setInterval(() => {
      this.#checkPeerHealth();
    }, this.#heartbeatInterval);
  }

  /**
   * Check peer health and emit heartbeat events
   * @private
   */
  #checkPeerHealth() {
    const now = Date.now();
    const timeout = ProtocolConstants.HEARTBEAT_TIMEOUT;

    const connectedPeers = this.getAllPeers({ connected: true });

    for (const peer of connectedPeers) {
      const timeSinceHeartbeat = now - peer.lastHeartbeat;

      if (timeSinceHeartbeat > timeout) {
        logger.warn('Peer heartbeat timeout', {
          nodeId: peer.nodeId,
          timeSinceHeartbeat,
        });

        this.removePeer(peer.nodeId, 'heartbeat_timeout');
      } else {
        // Request heartbeat
        this.emit('peer:heartbeat_needed', peer);
      }
    }
  }

  /**
   * Start reconnection process
   * @private
   */
  #startReconnection() {
    if (this.#reconnectTimer) {
      clearInterval(this.#reconnectTimer);
    }

    this.#reconnectTimer = setInterval(() => {
      this.#attemptReconnections();
    }, ProtocolConstants.RECONNECT_DELAY);
  }

  /**
   * Attempt to reconnect to disconnected peers
   * @private
   */
  #attemptReconnections() {
    const disconnectedPeers = this.getAllPeers({ status: PeerStatus.DISCONNECTED });

    for (const peer of disconnectedPeers) {
      // Check if we should attempt reconnection
      if (peer.reconnectAttempts >= ProtocolConstants.MAX_RECONNECT_ATTEMPTS) {
        continue;
      }

      // Calculate backoff delay
      const backoffDelay =
        ProtocolConstants.RECONNECT_DELAY *
        Math.pow(ProtocolConstants.RECONNECT_BACKOFF_MULTIPLIER, peer.reconnectAttempts);

      const timeSinceDisconnect = Date.now() - (peer.disconnectedAt || 0);

      if (timeSinceDisconnect >= Math.min(backoffDelay, ProtocolConstants.MAX_RECONNECT_DELAY)) {
        peer.reconnectAttempts++;
        peer.status = PeerStatus.CONNECTING;

        logger.info('Attempting peer reconnection', {
          nodeId: peer.nodeId,
          attempt: peer.reconnectAttempts,
          address: peer.address,
          port: peer.port,
        });

        this.emit('peer:reconnect', peer);
      }
    }
  }

  /**
   * Get inbound peer count
   * @private
   * @returns {number} Inbound count
   */
  #getInboundPeerCount() {
    return this.getAllPeers({ connected: true }).filter((p) => p.inbound).length;
  }

  /**
   * Get outbound peer count
   * @private
   * @returns {number} Outbound count
   */
  #getOutboundPeerCount() {
    return this.getAllPeers({ connected: true }).filter((p) => !p.inbound).length;
  }

  /**
   * Persist peers to disk
   * @private
   */
  #persistPeers() {
    const peers = Array.from(this.#peers.values());
    this.#peerStorage.save(peers).catch((err) => {
      logger.error('Failed to persist peers', { error: err.message });
    });
  }

  /**
   * Cleanup and shutdown
   * @returns {Promise<void>}
   */
  async cleanup() {
    logger.info('Cleaning up peer manager');

    // Stop timers
    if (this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }

    if (this.#reconnectTimer) {
      clearInterval(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }

    // Disconnect all peers
    const connectedPeers = this.getAllPeers({ connected: true });
    for (const peer of connectedPeers) {
      this.removePeer(peer.nodeId, 'shutdown');
    }

    // Save peers immediately
    const peers = Array.from(this.#peers.values());
    await this.#peerStorage.saveImmediate(peers);

    logger.info('Peer manager cleaned up');
  }
}
