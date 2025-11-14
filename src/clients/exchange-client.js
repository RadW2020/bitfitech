/**
 * @fileoverview P2P Exchange Client - Main interface for the distributed exchange
 * @author Raul JM
 */

import OrderBook from '../core/orderbook.js';
import GrenacheService from '../services/grenache-service.js';
import { randomUUID } from 'node:crypto';
import config from '../utils/config.js';
import { MultiTierRateLimiter } from '../utils/rate-limiter.js';
import { VectorClock } from '../utils/vector-clock.js';
import {
  PeerManager,
  DirectConnectionService,
  PeerDiscovery,
  MessageRouter,
  MessageType,
  PeerMessage,
} from '../p2p/index.js';
import { createLogger } from '../utils/logger.js';

/**
 * @typedef {Object} ExchangeConfig
 * @property {string} grapeUrl - Grenache grape URL
 * @property {string} pair - Trading pair
 * @property {string} userId - User ID for this client
 */

/**
 * @typedef {Object} OrderResult
 * @property {boolean} success - Order success
 * @property {string} orderId - Order ID
 * @property {Object[]} trades - Executed trades
 * @property {Object|null} remainingOrder - Remaining order if partially filled
 * @property {Object} distribution - Distribution result to other nodes
 */

/**
 * P2P Exchange Client
 * Main interface for interacting with the distributed exchange
 * Each client has its own orderbook and communicates with other clients via Grenache
 */
const logger = createLogger('ExchangeClient');

export default class ExchangeClient {
  #orderbook = null;
  #grenacheService = null;
  #config = null;
  #userId = null;
  #isInitialized = false;
  #orderHistory = new Map();
  #tradeHistory = [];
  #rateLimiter = new MultiTierRateLimiter();
  #pendingEvents = new Map(); // For event ordering
  #lastProcessedClock = new Map(); // Track last processed vector clock per node

  // P2P Components (Always Enabled)
  #peerManager = null;
  #directConnectionService = null;
  #peerDiscovery = null;
  #messageRouter = null;
  #hasGrenache = false;

  constructor(clientConfig) {
    this.#config = {
      grapeUrl: clientConfig.grenache?.url || clientConfig.grapeUrl || config.grenache.url,
      pair: clientConfig.exchange?.pair || clientConfig.pair || config.exchange.pair,
      userId: clientConfig.userId || randomUUID(),
      // P2P Configuration (Always Enabled)
      p2p: {
        port: clientConfig.p2p?.port || config.p2p?.port || 3000,
        host: clientConfig.p2p?.host || config.p2p?.host || '0.0.0.0',
        enableMDNS: clientConfig.p2p?.enableMDNS !== false && config.p2p?.enableMDNS !== false,
        enableGrenache:
          clientConfig.p2p?.enableGrenache !== false && config.p2p?.enableGrenache !== false,
        bootstrapPeers: clientConfig.p2p?.bootstrapPeers || config.p2p?.bootstrapPeers || [],
        peerStoragePath: clientConfig.p2p?.peerStoragePath || config.p2p?.peerStoragePath,
      },
    };

    this.#userId = this.#config.userId;
    this.#orderbook = new OrderBook(this.#config.pair, this.#userId);
    this.#grenacheService = new GrenacheService(this.#config.grapeUrl);

    // Initialize P2P components (always enabled)
    this.#initializeP2PComponents();
  }

  /**
   * Get user ID
   * @returns {string} User ID
   */
  get userId() {
    return this.#userId;
  }

  /**
   * Get trading pair
   * @returns {string} Trading pair
   */
  get pair() {
    return this.#config.pair;
  }

  /**
   * Get orderbook
   * @returns {OrderBook} Orderbook instance
   */
  get orderbook() {
    return this.#orderbook;
  }

  /**
   * Get grenache service
   * @returns {GrenacheService} Grenache service instance
   */
  get grenacheService() {
    return this.#grenacheService;
  }

  /**
   * Check if client is initialized
   * @returns {boolean} Initialization status
   */
  get isInitialized() {
    return this.#isInitialized;
  }

  /**
   * Initialize P2P components
   * @private
   */
  #initializeP2PComponents() {
    const p2pConfig = this.#config.p2p;

    // Create peer manager
    this.#peerManager = new PeerManager(this.#userId, {
      maxInboundPeers: 50,
      maxOutboundPeers: 50,
      peerStoragePath: p2pConfig.peerStoragePath,
    });

    // Create direct connection service
    this.#directConnectionService = new DirectConnectionService(this.#userId, {
      port: p2pConfig.port,
      host: p2pConfig.host,
    });

    // Create peer discovery
    this.#peerDiscovery = new PeerDiscovery(this.#userId, p2pConfig.port, this.#peerManager, {
      grenacheService: this.#grenacheService,
      bootstrapPeers: p2pConfig.bootstrapPeers,
      enableMDNS: p2pConfig.enableMDNS,
      enableGrenache: p2pConfig.enableGrenache,
      enablePeerExchange: true,
    });

    // Create message router
    this.#messageRouter = new MessageRouter(this.#directConnectionService, this.#peerManager, {
      grenacheService: this.#grenacheService,
    });
  }

  /**
   * Initialize the exchange client
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.#isInitialized) {
      return;
    }

    try {
      // Try to initialize Grenache service (optional)
      try {
        await this.#grenacheService.initialize();
        this.#hasGrenache = true;
        logger.info('Grenache service initialized');
      } catch (error) {
        logger.warn('Grenache not available, running in pure P2P mode', { error: error.message });
        this.#hasGrenache = false;
      }

      // Initialize P2P system (always enabled)
      logger.info('Initializing P2P system');

      // Initialize peer manager
      await this.#peerManager.initialize();

      // Start direct connection service
      await this.#directConnectionService.start();

      // Start message router
      this.#messageRouter.start();

      // Set up P2P event handlers
      this.#setupP2PEventHandlers();

      // Start peer discovery
      await this.#peerDiscovery.start();

      logger.info('P2P system initialized', {
        port: this.#config.p2p.port,
        mdns: this.#config.p2p.enableMDNS,
        bootstrapPeers: this.#config.p2p.bootstrapPeers.length,
      });

      // Set up message handlers (Grenache if available)
      if (this.#hasGrenache) {
        this.#setupMessageHandlers();
      }

      this.#isInitialized = true;
      logger.info('Exchange client initialized', {
        userId: this.#userId,
        pair: this.#config.pair,
        hasGrenache: this.#hasGrenache,
      });
    } catch (error) {
      logger.error('Failed to initialize exchange client', { error: error.message });
      throw error;
    }
  }

  /**
   * Place a buy order
   * @param {string} amount - Order amount
   * @param {string} price - Order price
   * @returns {Promise<OrderResult>} Order result
   */
  async placeBuyOrder(amount, price) {
    return await this.#placeOrder('buy', amount, price);
  }

  /**
   * Place a sell order
   * @param {string} amount - Order amount
   * @param {string} price - Order price
   * @returns {Promise<OrderResult>} Order result
   */
  async placeSellOrder(amount, price) {
    return await this.#placeOrder('sell', amount, price);
  }

  /**
   * Cancel an order
   * @param {string} orderId - Order ID to cancel
   * @returns {boolean} Success status
   */
  cancelOrder(orderId) {
    const success = this.#orderbook.cancelOrder(orderId);
    if (success) {
      console.log(`❌ Order ${orderId} cancelled`);
    }
    return success;
  }

  /**
   * Get orderbook snapshot
   * @param {number} depth - Maximum depth
   * @returns {Object} Orderbook snapshot
   */
  getOrderBook(depth = 10) {
    return this.#orderbook.getOrderBook(depth);
  }

  /**
   * Get user's orders
   * @returns {Object[]} User orders
   */
  getUserOrders() {
    return this.#orderbook.getUserOrders(this.#userId);
  }

  /**
   * Get recent trades
   * @param {number} limit - Maximum number of trades
   * @returns {Object[]} Recent trades
   */
  getRecentTrades(limit = 50) {
    return this.#orderbook.getRecentTrades(limit);
  }

  /**
   * Get order history
   * @returns {Object[]} Order history
   */
  getOrderHistory() {
    return Array.from(this.#orderHistory.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get trade history
   * @returns {Object[]} Trade history
   */
  getTradeHistory() {
    return this.#tradeHistory.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get order by ID
   * @param {string} orderId - Order ID
   * @returns {Object|undefined} Order or undefined
   */
  getOrder(orderId) {
    return this.#orderbook.getOrder(orderId);
  }

  /**
   * Place an order (internal method)
   * @param {string} side - Order side ('buy' or 'sell')
   * @param {string} amount - Order amount
   * @param {string} price - Order price
   * @returns {Promise<OrderResult>} Order result
   * @private
   */
  async #placeOrder(side, amount, price) {
    if (!this.#isInitialized) {
      throw new Error('Exchange client not initialized');
    }

    // Rate limiting (only if enabled)
    if (config.security.enableRateLimit && !this.#rateLimiter.isAllowed(this.#userId, 'orders')) {
      throw new Error('Rate limit exceeded: too many orders');
    }

    try {
      // Create order data
      const orderData = {
        userId: this.#userId,
        side,
        amount,
        price,
        pair: this.#config.pair,
      };

      console.log(`📝 Placing ${side} order: ${amount} @ ${price}`);

      // Add order to local orderbook
      const matchResult = await this.#orderbook.addOrder(orderData);
      const order = this.#orderbook.getOrder(
        matchResult.remainingOrder?.id ||
          matchResult.trades[0]?.buyOrderId ||
          matchResult.trades[0]?.sellOrderId
      );

      // Store order in history
      if (order) {
        this.#orderHistory.set(order.id, {
          ...order,
          localTrades: matchResult.trades,
          timestamp: Date.now(),
        });
      }

      // Store trades in history
      this.#tradeHistory.push(...matchResult.trades);

      // Distribute order to other nodes via P2P (Grenache used as fallback if enabled)
      let distribution = { success: false, distributedTo: [], failedTo: [] };
      if (order) {
        try {
          const orderMessage = PeerMessage.order(this.#userId, order);
          await this.#messageRouter.broadcast(orderMessage);
          logger.info('Order distributed via P2P');
          distribution = { success: true, distributedTo: ['p2p'], failedTo: [] };
        } catch (error) {
          logger.error('Failed to distribute order', { error: error.message });
        }
      }

      // Broadcast trades to other nodes via P2P
      for (const trade of matchResult.trades) {
        try {
          const tradeMessage = PeerMessage.trade(this.#userId, trade);
          await this.#messageRouter.broadcast(tradeMessage);
        } catch (error) {
          logger.error('Failed to broadcast trade', { error: error.message });
        }
      }

      return {
        success: true,
        orderId: order?.id,
        trades: matchResult.trades,
        remainingOrder: matchResult.remainingOrder,
        distribution,
      };
    } catch (error) {
      console.error('❌ Failed to place order:', error);
      return {
        success: false,
        orderId: null,
        trades: [],
        remainingOrder: null,
        distribution: { success: false, distributedTo: [], failedTo: [] },
        error: error.message,
      };
    }
  }

  /**
   * Set up message handlers for Grenache communication
   * @private
   */
  #setupMessageHandlers() {
    // Handle incoming orders from other nodes
    this.#grenacheService.addOrderHandler(async (order, vectorClock) => {
      try {
        console.log(`📨 Processing order from other node: ${order.id}`);

        // Process event with vector clock ordering
        await this.#processEventWithOrdering('order', { order, vectorClock });
      } catch (error) {
        console.error('❌ Error processing order from other node:', error);
      }
    });

    // Handle incoming trades from other nodes
    this.#grenacheService.addTradeHandler((trade, vectorClock) => {
      try {
        console.log(`💰 Received trade from other node: ${trade.id}`);
        // Process event with vector clock ordering
        this.#processEventWithOrdering('trade', { trade, vectorClock });
      } catch (error) {
        console.error('❌ Error processing trade from other node:', error);
      }
    });

  }

  /**
   * Set up event handlers for P2P communication
   * @private
   */
  #setupP2PEventHandlers() {
    // Handle peer connected
    this.#directConnectionService.on('peer:connected', (peerInfo) => {
      logger.info('Peer connected', { peerId: peerInfo.nodeId });
      this.#peerManager.addPeer(peerInfo);
    });

    // Handle peer disconnected
    this.#directConnectionService.on('peer:disconnected', ({ peerId, reason }) => {
      logger.info('Peer disconnected', { peerId, reason });
      this.#peerManager.removePeer(peerId, reason);
    });

    // Handle incoming P2P messages
    this.#directConnectionService.on('peer:message', ({ peerId, message }) => {
      this.#handleP2PMessage(peerId, message);
    });

    // Handle heartbeat requests
    this.#directConnectionService.on('peer:heartbeat', ({ peerId }) => {
      this.#peerManager.updateHeartbeat(peerId);
    });

    // Handle heartbeat needed (from peer manager)
    this.#peerManager.on('peer:heartbeat_needed', (peer) => {
      const heartbeat = PeerMessage.heartbeat(this.#userId);
      this.#directConnectionService.sendMessage(peer.nodeId, heartbeat).catch((err) => {
        logger.debug('Failed to send heartbeat', { peerId: peer.nodeId, error: err.message });
      });
    });

    // Handle peer reconnection attempts
    this.#peerManager.on('peer:reconnect', async (peer) => {
      try {
        await this.#directConnectionService.connect(peer.address, peer.port);
        logger.info('Peer reconnected', { peerId: peer.nodeId });
      } catch (err) {
        logger.debug('Peer reconnection failed', { peerId: peer.nodeId, error: err.message });
        peer.failedConnections = (peer.failedConnections || 0) + 1;
      }
    });

    // Handle peer discovery
    this.#peerDiscovery.on('peer:discovered', async (peerInfo) => {
      logger.info('Peer discovered', { source: peerInfo.source, address: peerInfo.address });

      // Try to connect if not already connected
      const existingPeer = this.#peerManager.getPeer(peerInfo.nodeId);
      if (!existingPeer || existingPeer.status === 'disconnected') {
        try {
          await this.#directConnectionService.connect(peerInfo.address, peerInfo.port);
          logger.info('Connected to discovered peer', { address: peerInfo.address });
        } catch (err) {
          logger.debug('Failed to connect to discovered peer', { error: err.message });
        }
      }
    });

    // Handle peer exchange requests
    this.#peerDiscovery.on('peer:exchange_request', ({ peerId }) => {
      const peers = this.#peerManager.getPeersForSharing();
      const peerExchange = PeerMessage.peerExchange(this.#userId, peers);

      this.#directConnectionService.sendMessage(peerId, peerExchange).catch((err) => {
        logger.debug('Failed to send peer exchange', { peerId, error: err.message });
      });
    });

    // Handle message router events for Grenache fallback
    if (this.#hasGrenache) {
      this.#messageRouter.on('grenache:send', async ({ peerId, message }) => {
        try {
          // Convert P2P message to Grenache format and send
          if (message.type === MessageType.ORDER) {
            await this.#grenacheService.distributeOrder(message.order);
          } else if (message.type === MessageType.TRADE) {
            await this.#grenacheService.broadcastTrade(message.trade);
          }
        } catch (err) {
          logger.error('Grenache fallback failed', { error: err.message });
        }
      });

      this.#messageRouter.on('grenache:broadcast', async ({ message }) => {
        try {
          if (message.type === MessageType.ORDER) {
            await this.#grenacheService.distributeOrder(message.order);
          } else if (message.type === MessageType.TRADE) {
            await this.#grenacheService.broadcastTrade(message.trade);
          }
        } catch (err) {
          logger.error('Grenache broadcast fallback failed', { error: err.message });
        }
      });
    }
  }

  /**
   * Handle incoming P2P message
   * @private
   * @param {string} peerId - Peer ID
   * @param {Object} message - Message object
   */
  async #handleP2PMessage(peerId, message) {
    switch (message.type) {
      case MessageType.ORDER:
        await this.#processEventWithOrdering('order', {
          order: message.order,
          vectorClock: null, // P2P messages don't use Grenache vector clocks
        });
        break;

      case MessageType.TRADE:
        this.#processEventWithOrdering('trade', {
          trade: message.trade,
          vectorClock: null,
        });
        break;

      case MessageType.PEER_EXCHANGE:
        this.#peerDiscovery.handlePeerExchangeResponse(message.peers, peerId);
        break;

      case MessageType.PEER_EXCHANGE_REQUEST:
        const peers = this.#peerManager.getPeersForSharing();
        const peerExchange = PeerMessage.peerExchange(this.#userId, peers);
        await this.#directConnectionService.sendMessage(peerId, peerExchange);
        break;

      default:
        logger.warn('Unknown P2P message type', { type: message.type, from: peerId });
    }

    // Update peer stats
    this.#peerManager.updateStats(peerId, { messageReceived: true, bytes: JSON.stringify(message).length });
  }

  /**
   * Process event with vector clock ordering
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event data with vector clock
   * @private
   */
  async #processEventWithOrdering(eventType, eventData) {
    const { vectorClock } = eventData;

    if (!vectorClock) {
      // No vector clock, process immediately
      await this.#processEvent(eventType, eventData);
      return;
    }

    const nodeId = vectorClock.nodeId;
    const eventId = `${nodeId}-${Date.now()}-${Math.random()}`;

    // Store event for ordering
    this.#pendingEvents.set(eventId, { eventType, eventData, timestamp: Date.now() });

    // Try to process pending events
    await this.#processPendingEvents();
  }

  /**
   * Process pending events in correct order
   * @private
   */
  async #processPendingEvents() {
    const events = Array.from(this.#pendingEvents.entries());

    // Sort events by vector clock
    events.sort(([, a], [, b]) => {
      const clockA = a.eventData.vectorClock;
      const clockB = b.eventData.vectorClock;

      if (!clockA || !clockB) return 0;

      const vcA = new VectorClock(clockA.nodeId, clockA.clock);
      const vcB = new VectorClock(clockB.nodeId, clockB.clock);

      if (vcA.happensBefore(vcB)) return -1;
      if (vcB.happensBefore(vcA)) return 1;
      return 0;
    });

    // Process events in order
    for (const [eventId, event] of events) {
      const { eventType, eventData } = event;
      const vectorClock = eventData.vectorClock;

      if (vectorClock) {
        const nodeId = vectorClock.nodeId;
        const lastClock = this.#lastProcessedClock.get(nodeId);

        // Check if we can process this event
        if (lastClock) {
          const vcLast = new VectorClock(nodeId, lastClock);
          const vcCurrent = new VectorClock(nodeId, vectorClock.clock);

          if (!vcLast.happensBefore(vcCurrent)) {
            // Can't process yet, wait for missing events
            continue;
          }
        }

        // Process the event
        await this.#processEvent(eventType, eventData);

        // Update last processed clock
        this.#lastProcessedClock.set(nodeId, vectorClock.clock);
      } else {
        // No vector clock, process immediately
        await this.#processEvent(eventType, eventData);
      }

      // Remove processed event
      this.#pendingEvents.delete(eventId);
    }
  }

  /**
   * Process a single event
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event data
   * @private
   */
  async #processEvent(eventType, eventData) {
    switch (eventType) {
    case 'order':
      await this.#processOrderEvent(eventData);
      break;
    case 'trade':
      this.#processTradeEvent(eventData);
      break;
    default:
      console.warn(`Unknown event type: ${eventType}`);
    }
  }

  /**
   * Process order event
   * @param {Object} eventData - Order event data
   * @private
   */
  async #processOrderEvent(eventData) {
    const { order, vectorClock } = eventData;

    // Add order to local orderbook with vector clock
    const matchResult = await this.#orderbook.addOrder(order, vectorClock);

    // Store order in history
    if (matchResult.remainingOrder) {
      this.#orderHistory.set(matchResult.remainingOrder.id, {
        ...matchResult.remainingOrder,
        localTrades: matchResult.trades,
        timestamp: Date.now(),
      });
    }

    // Store trades in history
    this.#tradeHistory.push(...matchResult.trades);

    // Broadcast trades to other nodes
    for (const trade of matchResult.trades) {
      try {
        await this.#grenacheService.broadcastTrade(trade);
      } catch (error) {
        console.error('❌ Failed to broadcast trade:', error);
      }
    }

    console.log(`✅ Processed order ${order.id} with ${matchResult.trades.length} trades`);
  }

  /**
   * Process trade event
   * @param {Object} eventData - Trade event data
   * @private
   */
  #processTradeEvent(eventData) {
    const { trade } = eventData;
    this.#tradeHistory.push(trade);
  }


  // Node synchronization removed - vector clocks handle event ordering

  /**
   * Get vector clock status for debugging
   * @returns {Object} Vector clock status
   */
  getVectorClockStatus() {
    return {
      nodeId: this.#userId,
      vectorClock: this.#grenacheService.getVectorClock(),
      pendingEvents: this.#pendingEvents.size,
      lastProcessedClocks: Object.fromEntries(this.#lastProcessedClock),
    };
  }

  /**
   * Force process pending events (for testing)
   */
  async forceProcessPendingEvents() {
    await this.#processPendingEvents();
  }

  /**
   * Get P2P statistics
   * @returns {Object} P2P stats
   */
  getP2PStats() {
    return {
      hasGrenache: this.#hasGrenache,
      peers: this.#peerManager?.getStats() || {},
      discovery: this.#peerDiscovery?.getStats() || {},
      router: this.#messageRouter?.getStats() || {},
      directConnection: this.#directConnectionService?.getInfo() || {},
    };
  }

  async destroy() {
    logger.info('Destroying exchange client');

    // Stop P2P components (always running)
    try {
      // Stop peer discovery
      if (this.#peerDiscovery) {
        await this.#peerDiscovery.stop();
      }

      // Stop message router
      if (this.#messageRouter) {
        this.#messageRouter.stop();
      }

      // Cleanup peer manager (saves peers to disk)
      if (this.#peerManager) {
        await this.#peerManager.cleanup();
      }

      // Stop direct connection service
      if (this.#directConnectionService) {
        await this.#directConnectionService.stop();
      }

      logger.info('P2P components stopped');
    } catch (error) {
      logger.error('Error stopping P2P components', { error: error.message });
    }

    // Stop Grenache service
    if (this.#grenacheService) {
      this.#grenacheService.destroy();
    }

    // Destroy rate limiter
    if (this.#rateLimiter) {
      this.#rateLimiter.destroy();
    }

    this.#isInitialized = false;
    this.#pendingEvents.clear();
    this.#lastProcessedClock.clear();
    logger.info('Exchange client destroyed');
  }
}
