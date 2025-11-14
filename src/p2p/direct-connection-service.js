/**
 * Direct Connection Service
 *
 * Handles direct TCP connections between peers for true P2P communication.
 * Implements both server (accepting connections) and client (initiating connections).
 */

import net from 'net';
import EventEmitter from 'events';
import {
  MessageType,
  PeerMessage,
  PeerStatus,
  ProtocolConstants,
  PROTOCOL_VERSION,
  ErrorCode,
  serializeMessage,
  MessageParser,
} from './peer-protocol.js';
import { logger, LogLevel } from '../utils/logger.js';

/**
 * Direct connection service class
 */
export class DirectConnectionService extends EventEmitter {
  #nodeId;
  #port;
  #host;
  #server;
  #isRunning;
  #connections;
  #pendingHandshakes;
  #logger;

  /**
   * Create direct connection service
   * @param {string} nodeId - This node's identifier
   * @param {Object} options - Configuration options
   */
  constructor(nodeId, options = {}) {
    super();

    this.#nodeId = nodeId;
    this.#port = options.port || 3000;
    this.#host = options.host || '0.0.0.0';
    this.#server = null;
    this.#isRunning = false;
    this.#connections = new Map();
    this.#pendingHandshakes = new Map();
    this.#logger = logger.child({
      component: 'DirectConnectionService',
      nodeId: nodeId.slice(0, 8),
    });
  }

  /**
   * Start the TCP server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.#isRunning) {
      this.#logger.system(LogLevel.WARN, 'Direct connection service already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.#server = net.createServer((socket) => {
        this.#handleIncomingConnection(socket);
      });

      this.#server.on('error', (err) => {
        this.#logger.error(LogLevel.ERROR, 'Server error', err);
        this.emit('error', err);
      });

      this.#server.listen(this.#port, this.#host, () => {
        this.#isRunning = true;
        this.#logger.system(LogLevel.INFO, 'Direct connection service started', {
          host: this.#host,
          port: this.#port,
          nodeId: this.#nodeId,
        });
        resolve();
      });

      this.#server.on('error', reject);
    });
  }

  /**
   * Stop the TCP server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.#isRunning) {
      return;
    }

    this.#logger.system(LogLevel.INFO, 'Stopping direct connection service');

    // Close all connections
    for (const [peerId, conn] of this.#connections.entries()) {
      await this.#disconnect(peerId, 'shutdown');
    }

    // Close server
    return new Promise((resolve) => {
      if (this.#server) {
        this.#server.close(() => {
          this.#isRunning = false;
          this.#logger.system(LogLevel.INFO, 'Direct connection service stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Connect to a remote peer
   * @param {string} address - Peer address
   * @param {number} port - Peer port
   * @returns {Promise<string>} Connected peer's nodeId
   */
  async connect(address, port) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: address, port }, () => {
        this.#logger.system(LogLevel.INFO, 'Outbound connection established', { address, port });
      });

      const tempId = `${address}:${port}`;
      const parser = new MessageParser();
      const handshakeTimeout = setTimeout(() => {
        socket.destroy();
        this.#pendingHandshakes.delete(tempId);
        reject(new Error('Handshake timeout'));
      }, ProtocolConstants.HANDSHAKE_TIMEOUT);

      // Store pending handshake
      this.#pendingHandshakes.set(tempId, {
        socket,
        parser,
        address,
        port,
        inbound: false,
        resolve,
        reject,
        handshakeTimeout,
      });

      // Send handshake
      const handshake = PeerMessage.handshake(this.#nodeId, this.#port);
      this.#sendRaw(socket, handshake);

      // Setup socket handlers
      this.#setupSocketHandlers(socket, tempId, parser, false);

      socket.on('error', (err) => {
        clearTimeout(handshakeTimeout);
        this.#pendingHandshakes.delete(tempId);
        reject(err);
      });
    });
  }

  /**
   * Disconnect from a peer
   * @param {string} peerId - Peer identifier
   * @param {string} reason - Disconnect reason
   * @returns {Promise<void>}
   */
  async #disconnect(peerId, reason = 'normal') {
    const conn = this.#connections.get(peerId);

    if (!conn) {
      return;
    }

    this.#logger.system(LogLevel.INFO, 'Disconnecting peer', { peerId, reason });

    // Send disconnect message
    try {
      const disconnect = PeerMessage.disconnect(this.#nodeId, reason);
      await this.#sendRaw(conn.socket, disconnect);
    } catch (err) {
      this.#logger.system(LogLevel.DEBUG, 'Error sending disconnect message', { error: err.message });
    }

    // Close socket
    if (!conn.socket.destroyed) {
      conn.socket.destroy();
    }

    // Remove from connections
    this.#connections.delete(peerId);

    this.emit('peer:disconnected', { peerId, reason });
  }

  /**
   * Send a message to a peer
   * @param {string} peerId - Peer identifier
   * @param {Object} message - Message to send
   * @returns {Promise<void>}
   */
  async sendMessage(peerId, message) {
    const conn = this.#connections.get(peerId);

    if (!conn) {
      throw new Error(`Peer not connected: ${peerId}`);
    }

    if (conn.socket.destroyed) {
      this.#connections.delete(peerId);
      throw new Error(`Peer connection destroyed: ${peerId}`);
    }

    await this.#sendRaw(conn.socket, message);

    // Update stats
    this.emit('peer:message_sent', { peerId, message });
  }

  /**
   * Broadcast a message to all connected peers
   * @param {Object} message - Message to broadcast
   * @returns {Promise<Array>} Results of send operations
   */
  async broadcast(message) {
    const promises = [];

    for (const [peerId] of this.#connections) {
      promises.push(
        this.sendMessage(peerId, message).catch((err) => {
          this.#logger.error(LogLevel.ERROR, 'Broadcast failed to peer', err);
          return { peerId, error: err };
        })
      );
    }

    return Promise.all(promises);
  }

  /**
   * Get connected peer IDs
   * @returns {Array<string>} Connected peer IDs
   */
  getConnectedPeerIds() {
    return Array.from(this.#connections.keys());
  }

  /**
   * Check if connected to a peer
   * @param {string} peerId - Peer identifier
   * @returns {boolean} True if connected
   */
  isConnected(peerId) {
    return this.#connections.has(peerId);
  }

  /**
   * Get connection count
   * @returns {number} Number of connections
   */
  getConnectionCount() {
    return this.#connections.size;
  }

  /**
   * Handle incoming connection
   * @private
   * @param {net.Socket} socket - Incoming socket
   */
  #handleIncomingConnection(socket) {
    const address = socket.remoteAddress;
    const port = socket.remotePort;
    const tempId = `${address}:${port}`;

    this.#logger.system(LogLevel.INFO, 'Incoming connection', { address, port });

    const parser = new MessageParser();
    const handshakeTimeout = setTimeout(() => {
      this.#logger.system(LogLevel.WARN, 'Inbound handshake timeout', { address, port });
      socket.destroy();
      this.#pendingHandshakes.delete(tempId);
    }, ProtocolConstants.HANDSHAKE_TIMEOUT);

    // Store pending handshake
    this.#pendingHandshakes.set(tempId, {
      socket,
      parser,
      address,
      port,
      inbound: true,
      handshakeTimeout,
    });

    // Setup socket handlers
    this.#setupSocketHandlers(socket, tempId, parser, true);
  }

  /**
   * Setup socket event handlers
   * @private
   * @param {net.Socket} socket - Socket
   * @param {string} tempId - Temporary connection ID
   * @param {MessageParser} parser - Message parser
   * @param {boolean} inbound - Is inbound connection
   */
  #setupSocketHandlers(socket, tempId, parser, inbound) {
    socket.on('data', (data) => {
      try {
        const messages = parser.parse(data);

        for (const message of messages) {
          this.#handleMessage(socket, tempId, message, inbound);
        }
      } catch (err) {
        this.#logger.error(LogLevel.ERROR, 'Message parse error', err);
        socket.destroy();
        this.#pendingHandshakes.delete(tempId);
      }
    });

    socket.on('error', (err) => {
      this.#logger.error(LogLevel.ERROR, 'Socket error', err);
      this.#pendingHandshakes.delete(tempId);
    });

    socket.on('close', () => {
      this.#logger.system(LogLevel.DEBUG, 'Socket closed', { tempId });
      this.#pendingHandshakes.delete(tempId);

      // Find and remove from connections
      for (const [peerId, conn] of this.#connections.entries()) {
        if (conn.socket === socket) {
          this.#connections.delete(peerId);
          this.emit('peer:disconnected', { peerId, reason: 'connection_closed' });
          break;
        }
      }
    });
  }

  /**
   * Handle incoming message
   * @private
   * @param {net.Socket} socket - Socket
   * @param {string} tempId - Temporary connection ID
   * @param {Object} message - Parsed message
   * @param {boolean} inbound - Is inbound connection
   */
  #handleMessage(socket, tempId, message, inbound) {
    const pending = this.#pendingHandshakes.get(tempId);

    // Handle handshake
    if (message.type === MessageType.HANDSHAKE) {
      this.#handleHandshake(socket, tempId, message, inbound, pending);
      return;
    }

    // Handle handshake ACK
    if (message.type === MessageType.HANDSHAKE_ACK) {
      this.#handleHandshakeAck(socket, tempId, message, pending);
      return;
    }

    // Find connection by socket
    let peerId = null;
    for (const [id, conn] of this.#connections.entries()) {
      if (conn.socket === socket) {
        peerId = id;
        break;
      }
    }

    if (!peerId) {
      this.#logger.system(LogLevel.WARN, 'Received message from unknown peer', { message });
      return;
    }

    // Handle other message types
    switch (message.type) {
      case MessageType.HEARTBEAT:
        this.#handleHeartbeat(peerId, message);
        break;

      case MessageType.HEARTBEAT_ACK:
        this.emit('peer:heartbeat_ack', { peerId, message });
        break;

      case MessageType.DISCONNECT:
        this.#disconnect(peerId, message.reason);
        break;

      default:
        // Emit for application handling
        this.emit('peer:message', { peerId, message });
        break;
    }
  }

  /**
   * Handle handshake message
   * @private
   */
  #handleHandshake(socket, tempId, message, inbound, pending) {
    if (!pending) {
      this.#logger.system(LogLevel.WARN, 'Handshake for unknown connection', { tempId });
      return;
    }

    const { nodeId, version, port: peerPort, capabilities } = message;

    // Validate protocol version
    if (version !== PROTOCOL_VERSION) {
      this.#logger.system(LogLevel.WARN, 'Protocol version mismatch', { version, expected: PROTOCOL_VERSION });
      const error = PeerMessage.error(this.#nodeId, ErrorCode.PROTOCOL_VERSION_MISMATCH, 'Protocol version mismatch');
      this.#sendRaw(socket, error);
      socket.destroy();
      this.#pendingHandshakes.delete(tempId);
      return;
    }

    // Don't connect to ourselves
    if (nodeId === this.#nodeId) {
      this.#logger.system(LogLevel.DEBUG, 'Rejecting self-connection');
      socket.destroy();
      this.#pendingHandshakes.delete(tempId);
      return;
    }

    clearTimeout(pending.handshakeTimeout);

    // Send handshake (if inbound) or ACK (if outbound)
    if (inbound) {
      const handshake = PeerMessage.handshake(this.#nodeId, this.#port);
      this.#sendRaw(socket, handshake);
    } else {
      const ack = PeerMessage.handshakeAck(this.#nodeId);
      this.#sendRaw(socket, ack);
    }

    // Create connection
    const conn = {
      socket,
      parser: pending.parser,
      peerId: nodeId,
      address: pending.address,
      port: peerPort,
      inbound,
      capabilities,
      status: PeerStatus.CONNECTED,
      connectedAt: Date.now(),
    };

    this.#connections.set(nodeId, conn);
    this.#pendingHandshakes.delete(tempId);

    this.#logger.system(LogLevel.INFO, 'Peer handshake complete', { peerId: nodeId, inbound });

    this.emit('peer:connected', {
      nodeId,
      address: pending.address,
      port: peerPort,
      connection: socket,
      inbound,
      capabilities,
    });

    // Resolve promise for outbound connections
    if (pending.resolve) {
      pending.resolve(nodeId);
    }
  }

  /**
   * Handle handshake ACK message
   * @private
   */
  #handleHandshakeAck(socket, tempId, message, pending) {
    if (!pending) {
      this.#logger.system(LogLevel.WARN, 'Handshake ACK for unknown connection', { tempId });
      return;
    }

    clearTimeout(pending.handshakeTimeout);
    this.#pendingHandshakes.delete(tempId);

    this.#logger.system(LogLevel.DEBUG, 'Received handshake ACK', { from: message.nodeId });
  }

  /**
   * Handle heartbeat message
   * @private
   * @param {string} peerId - Peer identifier
   * @param {Object} message - Heartbeat message
   */
  #handleHeartbeat(peerId, message) {
    // Send heartbeat ACK
    const ack = PeerMessage.heartbeatAck(this.#nodeId);
    this.sendMessage(peerId, ack).catch((err) => {
      this.#logger.error(LogLevel.ERROR, 'Failed to send heartbeat ACK', err);
    });

    this.emit('peer:heartbeat', { peerId, message });
  }

  /**
   * Send raw message (with serialization)
   * @private
   * @param {net.Socket} socket - Socket
   * @param {Object} message - Message to send
   * @returns {Promise<void>}
   */
  #sendRaw(socket, message) {
    return new Promise((resolve, reject) => {
      try {
        const buffer = serializeMessage(message);

        socket.write(buffer, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Get service info
   * @returns {Object} Service information
   */
  getInfo() {
    return {
      nodeId: this.#nodeId,
      host: this.#host,
      port: this.#port,
      isRunning: this.#isRunning,
      connections: this.#connections.size,
      pendingHandshakes: this.#pendingHandshakes.size,
    };
  }
}
