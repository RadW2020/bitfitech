/**
 * Peer-to-Peer Protocol Definitions
 *
 * Defines the message types, constants, and protocol specifications
 * for direct peer-to-peer communication.
 */

/**
 * Protocol version
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Message types for P2P communication
 */
export const MessageType = {
  // Connection lifecycle
  HANDSHAKE: 'handshake',
  HANDSHAKE_ACK: 'handshake_ack',
  DISCONNECT: 'disconnect',

  // Health monitoring
  HEARTBEAT: 'heartbeat',
  HEARTBEAT_ACK: 'heartbeat_ack',

  // Peer discovery
  PEER_EXCHANGE: 'peer_exchange',
  PEER_EXCHANGE_REQUEST: 'peer_exchange_request',

  // Exchange operations
  ORDER: 'order',
  TRADE: 'trade',
  CANCEL_ORDER: 'cancel_order',

  // Synchronization
  ORDERBOOK_SYNC_REQUEST: 'orderbook_sync_request',
  ORDERBOOK_SYNC_RESPONSE: 'orderbook_sync_response',

  // Errors
  ERROR: 'error',
};

/**
 * Peer status states
 */
export const PeerStatus = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  DISCONNECTING: 'disconnecting',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
};

/**
 * Protocol constants
 */
export const ProtocolConstants = {
  // Message framing
  MAX_MESSAGE_SIZE: 1024 * 1024, // 1MB max message size
  LENGTH_PREFIX_BYTES: 4, // 4 bytes for message length (uint32)

  // Timeouts
  HANDSHAKE_TIMEOUT: 10000, // 10 seconds
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  HEARTBEAT_TIMEOUT: 60000, // 60 seconds (2x interval)
  MESSAGE_TIMEOUT: 30000, // 30 seconds for regular messages

  // Retry and reconnection
  RECONNECT_DELAY: 5000, // 5 seconds
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_BACKOFF_MULTIPLIER: 2,
  MAX_RECONNECT_DELAY: 60000, // 1 minute max

  // Peer exchange
  PEER_EXCHANGE_INTERVAL: 60000, // 1 minute
  MAX_PEERS_TO_SHARE: 20, // Share up to 20 peers per exchange

  // Connection limits
  MAX_PENDING_MESSAGES: 100,
  MAX_INBOUND_CONNECTIONS: 50,
  MAX_OUTBOUND_CONNECTIONS: 50,
};

/**
 * Message structure factory
 */
export class PeerMessage {
  /**
   * Create a handshake message
   * @param {string} nodeId - Node identifier
   * @param {number} port - P2P listening port
   * @param {Object} capabilities - Node capabilities
   * @returns {Object} Handshake message
   */
  static handshake(nodeId, port, capabilities = {}) {
    return {
      type: MessageType.HANDSHAKE,
      version: PROTOCOL_VERSION,
      nodeId,
      port,
      timestamp: Date.now(),
      capabilities: {
        supportsOrderMatching: true,
        supportsPeerExchange: true,
        supportsOrderbookSync: true,
        ...capabilities,
      },
    };
  }

  /**
   * Create a handshake acknowledgment
   * @param {string} nodeId - Node identifier
   * @returns {Object} Handshake ACK message
   */
  static handshakeAck(nodeId) {
    return {
      type: MessageType.HANDSHAKE_ACK,
      nodeId,
      timestamp: Date.now(),
    };
  }

  /**
   * Create a heartbeat message
   * @param {string} nodeId - Node identifier
   * @returns {Object} Heartbeat message
   */
  static heartbeat(nodeId) {
    return {
      type: MessageType.HEARTBEAT,
      nodeId,
      timestamp: Date.now(),
    };
  }

  /**
   * Create a heartbeat acknowledgment
   * @param {string} nodeId - Node identifier
   * @returns {Object} Heartbeat ACK message
   */
  static heartbeatAck(nodeId) {
    return {
      type: MessageType.HEARTBEAT_ACK,
      nodeId,
      timestamp: Date.now(),
    };
  }

  /**
   * Create a peer exchange request
   * @param {string} nodeId - Node identifier
   * @returns {Object} Peer exchange request message
   */
  static peerExchangeRequest(nodeId) {
    return {
      type: MessageType.PEER_EXCHANGE_REQUEST,
      nodeId,
      timestamp: Date.now(),
    };
  }

  /**
   * Create a peer exchange response
   * @param {string} nodeId - Node identifier
   * @param {Array} peers - List of peer information
   * @returns {Object} Peer exchange message
   */
  static peerExchange(nodeId, peers) {
    return {
      type: MessageType.PEER_EXCHANGE,
      nodeId,
      peers: peers.slice(0, ProtocolConstants.MAX_PEERS_TO_SHARE),
      timestamp: Date.now(),
    };
  }

  /**
   * Create an order message
   * @param {string} nodeId - Node identifier
   * @param {Object} order - Order data
   * @returns {Object} Order message
   */
  static order(nodeId, order) {
    return {
      type: MessageType.ORDER,
      nodeId,
      order,
      timestamp: Date.now(),
    };
  }

  /**
   * Create a trade message
   * @param {string} nodeId - Node identifier
   * @param {Object} trade - Trade data
   * @returns {Object} Trade message
   */
  static trade(nodeId, trade) {
    return {
      type: MessageType.TRADE,
      nodeId,
      trade,
      timestamp: Date.now(),
    };
  }

  /**
   * Create a cancel order message
   * @param {string} nodeId - Node identifier
   * @param {string} orderId - Order ID to cancel
   * @returns {Object} Cancel order message
   */
  static cancelOrder(nodeId, orderId) {
    return {
      type: MessageType.CANCEL_ORDER,
      nodeId,
      orderId,
      timestamp: Date.now(),
    };
  }

  /**
   * Create an error message
   * @param {string} nodeId - Node identifier
   * @param {string} errorCode - Error code
   * @param {string} errorMessage - Error message
   * @returns {Object} Error message
   */
  static error(nodeId, errorCode, errorMessage) {
    return {
      type: MessageType.ERROR,
      nodeId,
      error: {
        code: errorCode,
        message: errorMessage,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Create a disconnect message
   * @param {string} nodeId - Node identifier
   * @param {string} reason - Disconnect reason
   * @returns {Object} Disconnect message
   */
  static disconnect(nodeId, reason = 'normal') {
    return {
      type: MessageType.DISCONNECT,
      nodeId,
      reason,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate message structure
   * @param {Object} message - Message to validate
   * @returns {boolean} True if valid
   */
  static validate(message) {
    if (!message || typeof message !== 'object') {
      return false;
    }

    if (!message.type || !Object.values(MessageType).includes(message.type)) {
      return false;
    }

    if (!message.timestamp || typeof message.timestamp !== 'number') {
      return false;
    }

    // Type-specific validation
    switch (message.type) {
      case MessageType.HANDSHAKE:
        return !!(message.nodeId && message.version && message.port);

      case MessageType.HANDSHAKE_ACK:
      case MessageType.HEARTBEAT:
      case MessageType.HEARTBEAT_ACK:
      case MessageType.DISCONNECT:
        return !!message.nodeId;

      case MessageType.PEER_EXCHANGE:
        return !!(message.nodeId && Array.isArray(message.peers));

      case MessageType.ORDER:
        return !!(message.nodeId && message.order);

      case MessageType.TRADE:
        return !!(message.nodeId && message.trade);

      case MessageType.CANCEL_ORDER:
        return !!(message.nodeId && message.orderId);

      case MessageType.ERROR:
        return !!(message.nodeId && message.error);

      default:
        return true;
    }
  }
}

/**
 * Error codes for P2P communication
 */
export const ErrorCode = {
  PROTOCOL_VERSION_MISMATCH: 'PROTOCOL_VERSION_MISMATCH',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  HANDSHAKE_TIMEOUT: 'HANDSHAKE_TIMEOUT',
  HEARTBEAT_TIMEOUT: 'HEARTBEAT_TIMEOUT',
  MESSAGE_TOO_LARGE: 'MESSAGE_TOO_LARGE',
  INVALID_ORDER: 'INVALID_ORDER',
  PEER_LIMIT_REACHED: 'PEER_LIMIT_REACHED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

/**
 * Serialize message to buffer with length prefix
 * @param {Object} message - Message to serialize
 * @returns {Buffer} Serialized message with length prefix
 */
export function serializeMessage(message) {
  const json = JSON.stringify(message);
  const payload = Buffer.from(json, 'utf8');

  if (payload.length > ProtocolConstants.MAX_MESSAGE_SIZE) {
    throw new Error(`Message too large: ${payload.length} bytes`);
  }

  // Create length prefix (4 bytes, big-endian)
  const lengthPrefix = Buffer.allocUnsafe(ProtocolConstants.LENGTH_PREFIX_BYTES);
  lengthPrefix.writeUInt32BE(payload.length, 0);

  // Combine length prefix and payload
  return Buffer.concat([lengthPrefix, payload]);
}

/**
 * Message parser class for handling streaming data
 */
export class MessageParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.expectedLength = null;
  }

  /**
   * Parse incoming data and extract complete messages
   * @param {Buffer} data - Incoming data
   * @returns {Array<Object>} Array of parsed messages
   */
  parse(data) {
    // Append new data to buffer
    this.buffer = Buffer.concat([this.buffer, data]);

    const messages = [];

    // Extract messages from buffer
    while (true) {
      // Read length prefix if we don't have it yet
      if (this.expectedLength === null) {
        if (this.buffer.length < ProtocolConstants.LENGTH_PREFIX_BYTES) {
          // Not enough data for length prefix
          break;
        }

        this.expectedLength = this.buffer.readUInt32BE(0);

        // Validate message length
        if (this.expectedLength > ProtocolConstants.MAX_MESSAGE_SIZE) {
          throw new Error(`Message too large: ${this.expectedLength} bytes`);
        }

        // Remove length prefix from buffer
        this.buffer = this.buffer.subarray(ProtocolConstants.LENGTH_PREFIX_BYTES);
      }

      // Check if we have complete message
      if (this.buffer.length < this.expectedLength) {
        // Not enough data yet
        break;
      }

      // Extract message payload
      const payload = this.buffer.subarray(0, this.expectedLength);
      this.buffer = this.buffer.subarray(this.expectedLength);
      this.expectedLength = null;

      // Parse JSON
      try {
        const json = payload.toString('utf8');
        const message = JSON.parse(json);

        if (PeerMessage.validate(message)) {
          messages.push(message);
        } else {
          throw new Error('Invalid message structure');
        }
      } catch (err) {
        throw new Error(`Failed to parse message: ${err.message}`);
      }
    }

    return messages;
  }

  /**
   * Reset parser state
   */
  reset() {
    this.buffer = Buffer.alloc(0);
    this.expectedLength = null;
  }
}
