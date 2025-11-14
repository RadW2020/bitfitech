/**
 * Peer Discovery - Pure P2P
 *
 * Multi-strategy peer discovery for true P2P networks:
 * - Persisted peers (reconnection)
 * - Bootstrap peers (well-known nodes)
 * - mDNS (local network discovery)
 * - Peer exchange (peers share peer lists)
 *
 * NO DHT, NO Grenache - just direct peer discovery.
 */

import dgram from 'dgram';
import EventEmitter from 'events';
import { MessageType, PeerMessage } from './peer-protocol.js';
import { logger, LogLevel } from '../utils/logger.js';
import { getBootstrapNodes } from './well-known-nodes.js';

/**
 * mDNS configuration
 */
const MDNS_MULTICAST_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;
const MDNS_SERVICE_NAME = '_bitfinex-exchange._tcp.local';
const MDNS_ANNOUNCE_INTERVAL = 30000; // 30 seconds

/**
 * Pure P2P Peer discovery class
 */
export class PeerDiscovery extends EventEmitter {
  #nodeId;
  #port;
  #peerManager;
  #bootstrapPeers;
  #enableMDNS;
  #enablePeerExchange;
  #mdnsSocket;
  #mdnsAnnounceTimer;
  #peerExchangeTimer;
  #isRunning;
  #logger;

  /**
   * Create peer discovery instance
   * @param {string} nodeId - This node's identifier
   * @param {number} port - P2P listening port
   * @param {Object} peerManager - Peer manager instance
   * @param {Object} options - Configuration options
   */
  constructor(nodeId, port, peerManager, options = {}) {
    super();

    this.#nodeId = nodeId;
    this.#port = port;
    this.#peerManager = peerManager;

    // Combine custom bootstrap peers with well-known nodes
    const useWellKnownNodes = options.useWellKnownNodes !== false;
    const network = options.network || process.env.NETWORK || 'local';
    const customBootstrap = options.bootstrapPeers || [];

    // Get combined bootstrap nodes (custom + well-known)
    this.#bootstrapPeers = useWellKnownNodes
      ? getBootstrapNodes(network, customBootstrap)
      : customBootstrap;

    this.#enableMDNS = options.enableMDNS !== false;
    this.#enablePeerExchange = options.enablePeerExchange !== false;
    this.#mdnsSocket = null;
    this.#mdnsAnnounceTimer = null;
    this.#peerExchangeTimer = null;
    this.#isRunning = false;
    this.#logger = logger.child({
      component: 'PeerDiscovery',
      nodeId: nodeId.slice(0, 8),
    });

    // Log bootstrap configuration
    if (this.#bootstrapPeers.length > 0) {
      this.#logger.system(LogLevel.INFO, 'Bootstrap nodes configured', {
        count: this.#bootstrapPeers.length,
        useWellKnown: useWellKnownNodes,
        network,
      });
    }
  }

  /**
   * Start peer discovery
   * @returns {Promise<void>}
   */
  async start() {
    if (this.#isRunning) {
      this.#logger.system(LogLevel.WARN, 'Peer discovery already running');
      return;
    }

    this.#logger.system(LogLevel.INFO, 'Starting pure P2P peer discovery', {
      strategies: {
        mdns: this.#enableMDNS,
        peerExchange: this.#enablePeerExchange,
        bootstrap: this.#bootstrapPeers.length > 0,
      },
    });

    this.#isRunning = true;

    // Start discovery strategies
    const promises = [];

    if (this.#enableMDNS) {
      promises.push(this.#startMDNS());
    }

    if (this.#enablePeerExchange) {
      this.#startPeerExchange();
    }

    // Connect to bootstrap peers
    if (this.#bootstrapPeers.length > 0) {
      promises.push(this.#connectToBootstrapPeers());
    }

    await Promise.allSettled(promises);

    this.#logger.system(LogLevel.INFO, 'Pure P2P peer discovery started');
  }

  /**
   * Stop peer discovery
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.#isRunning) {
      return;
    }

    this.#logger.system(LogLevel.INFO, 'Stopping peer discovery');

    this.#isRunning = false;

    // Stop mDNS
    if (this.#mdnsSocket) {
      this.#mdnsSocket.close();
      this.#mdnsSocket = null;
    }

    if (this.#mdnsAnnounceTimer) {
      clearInterval(this.#mdnsAnnounceTimer);
      this.#mdnsAnnounceTimer = null;
    }

    // Stop peer exchange
    if (this.#peerExchangeTimer) {
      clearInterval(this.#peerExchangeTimer);
      this.#peerExchangeTimer = null;
    }

    this.#logger.system(LogLevel.INFO, 'Peer discovery stopped');
  }

  /**
   * Manually discover peers (run all strategies once)
   * @returns {Promise<void>}
   */
  async discover() {
    const promises = [];

    if (this.#bootstrapPeers.length > 0) {
      promises.push(this.#connectToBootstrapPeers());
    }

    await Promise.allSettled(promises);
  }

  /**
   * Start mDNS discovery and announcement
   * @private
   * @returns {Promise<void>}
   */
  async #startMDNS() {
    try {
      this.#logger.system(LogLevel.INFO, 'Starting mDNS discovery');

      this.#mdnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.#mdnsSocket.on('message', (msg, rinfo) => {
        this.#handleMDNSMessage(msg, rinfo);
      });

      this.#mdnsSocket.on('error', (err) => {
        this.#logger.error(LogLevel.ERROR, 'mDNS socket error', err);
      });

      // Bind to mDNS port
      await new Promise((resolve, reject) => {
        this.#mdnsSocket.bind(MDNS_PORT, () => {
          try {
            this.#mdnsSocket.addMembership(MDNS_MULTICAST_ADDR);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });

      // Announce our presence
      this.#announceMDNS();

      // Periodic announcements
      this.#mdnsAnnounceTimer = setInterval(() => {
        this.#announceMDNS();
      }, MDNS_ANNOUNCE_INTERVAL);

      this.#logger.system(LogLevel.INFO, 'mDNS discovery started');
    } catch (err) {
      this.#logger.error(LogLevel.ERROR, 'Failed to start mDNS', err);
    }
  }

  /**
   * Announce presence via mDNS
   * @private
   */
  #announceMDNS() {
    if (!this.#mdnsSocket) {
      return;
    }

    const announcement = JSON.stringify({
      service: MDNS_SERVICE_NAME,
      nodeId: this.#nodeId,
      port: this.#port,
      timestamp: Date.now(),
    });

    const buffer = Buffer.from(announcement);

    this.#mdnsSocket.send(buffer, 0, buffer.length, MDNS_PORT, MDNS_MULTICAST_ADDR, (err) => {
      if (err) {
        this.#logger.error(LogLevel.ERROR, 'Failed to send mDNS announcement', err);
      } else {
        this.#logger.system(LogLevel.DEBUG, 'mDNS announcement sent');
      }
    });
  }

  /**
   * Handle incoming mDNS message
   * @private
   * @param {Buffer} msg - Message buffer
   * @param {Object} rinfo - Remote info
   */
  #handleMDNSMessage(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString());

      if (data.service !== MDNS_SERVICE_NAME) {
        return;
      }

      // Ignore our own announcements
      if (data.nodeId === this.#nodeId) {
        return;
      }

      this.#logger.system(LogLevel.INFO, 'Discovered peer via mDNS', {
        nodeId: data.nodeId,
        address: rinfo.address,
        port: data.port,
      });

      this.emit('peer:discovered', {
        nodeId: data.nodeId,
        address: rinfo.address,
        port: data.port,
        source: 'mdns',
      });
    } catch (err) {
      this.#logger.system(LogLevel.DEBUG, 'Invalid mDNS message', { error: err.message });
    }
  }

  /**
   * Connect to bootstrap peers
   * @private
   * @returns {Promise<void>}
   */
  async #connectToBootstrapPeers() {
    this.#logger.system(LogLevel.INFO, 'Connecting to bootstrap peers', { count: this.#bootstrapPeers.length });

    for (const peerAddr of this.#bootstrapPeers) {
      try {
        const [address, portStr] = peerAddr.split(':');
        const port = parseInt(portStr, 10);

        if (!address || !port) {
          this.#logger.system(LogLevel.WARN, 'Invalid bootstrap peer address', { peerAddr });
          continue;
        }

        this.#logger.system(LogLevel.INFO, 'Connecting to bootstrap peer', { address, port });

        this.emit('peer:discovered', {
          address,
          port,
          source: 'bootstrap',
        });
      } catch (err) {
        this.#logger.error(LogLevel.ERROR, 'Failed to connect to bootstrap peer', err);
      }
    }
  }

  /**
   * Start peer exchange protocol
   * @private
   */
  #startPeerExchange() {
    this.#logger.system(LogLevel.INFO, 'Starting peer exchange');

    // Request peers from connected peers periodically
    this.#peerExchangeTimer = setInterval(() => {
      this.#requestPeerExchange();
    }, 60000); // Every minute
  }

  /**
   * Request peer exchange from connected peers
   * @private
   */
  #requestPeerExchange() {
    const connectedPeers = this.#peerManager.getAllPeers({ connected: true });

    if (connectedPeers.length === 0) {
      return;
    }

    this.#logger.system(LogLevel.DEBUG, 'Requesting peer exchange', { peerCount: connectedPeers.length });

    for (const peer of connectedPeers) {
      this.emit('peer:exchange_request', { peerId: peer.nodeId });
    }
  }

  /**
   * Handle peer exchange response
   * @param {Array} peers - List of peers
   * @param {string} source - Source peer ID
   */
  handlePeerExchangeResponse(peers, source) {
    this.#logger.system(LogLevel.INFO, 'Received peer exchange', { count: peers.length, from: source });

    for (const peer of peers) {
      // Ignore ourselves
      if (peer.nodeId === this.#nodeId) {
        continue;
      }

      // Check if we're already connected
      const existing = this.#peerManager.getPeer(peer.nodeId);
      if (existing && existing.status !== 'disconnected') {
        continue;
      }

      this.#logger.system(LogLevel.INFO, 'Discovered peer via peer exchange', {
        nodeId: peer.nodeId,
        address: peer.address,
        port: peer.port,
      });

      this.emit('peer:discovered', {
        nodeId: peer.nodeId,
        address: peer.address,
        port: peer.port,
        capabilities: peer.capabilities,
        source: 'peer_exchange',
      });
    }
  }

  /**
   * Add bootstrap peer
   * @param {string} address - Peer address (host:port)
   */
  addBootstrapPeer(address) {
    if (!this.#bootstrapPeers.includes(address)) {
      this.#bootstrapPeers.push(address);
      this.#logger.system(LogLevel.INFO, 'Added bootstrap peer', { address });
    }
  }

  /**
   * Get discovery statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      mode: 'Pure P2P',
      isRunning: this.#isRunning,
      strategies: {
        mdns: this.#enableMDNS,
        peerExchange: this.#enablePeerExchange,
      },
      bootstrapPeers: this.#bootstrapPeers.length,
    };
  }
}
