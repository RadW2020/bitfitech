/**
 * @fileoverview Embedded Grape DHT server for true P2P architecture
 * Each node runs its own Grape server, forming a distributed DHT network
 * @author Raul JM
 */

import { Grape } from 'grenache-grape';
import { logger, LogLevel } from '../utils/logger.js';

/**
 * Embedded Grape server that runs within each exchange node
 * This eliminates the need for external Grape infrastructure
 */
export default class EmbeddedGrapeServer {
  #grape = null;
  #isStarted = false;
  #logger = null;
  #config = null;

  /**
   * Create an embedded Grape server
   * @param {Object} config - Grape configuration
   * @param {number} config.dhtPort - DHT communication port
   * @param {number} config.apiPort - HTTP API port
   * @param {string[]} config.bootstrapNodes - Bootstrap nodes for DHT
   * @param {string} [config.host] - Host to bind (default: all interfaces)
   */
  constructor(config) {
    if (!config.dhtPort || !config.apiPort) {
      throw new Error('dhtPort and apiPort are required');
    }

    this.#config = config;
    this.#logger = logger.child({
      component: 'EmbeddedGrapeServer',
      dhtPort: config.dhtPort,
      apiPort: config.apiPort,
    });
  }

  /**
   * Start the embedded Grape server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.#isStarted) {
      this.#logger.system(LogLevel.WARN, 'Grape server already started');
      return;
    }

    try {
      // Create Grape instance
      this.#grape = new Grape({
        host: this.#config.host || undefined, // undefined = bind all interfaces
        dht_port: this.#config.dhtPort,
        dht_bootstrap: this.#config.bootstrapNodes || [],
        api_port: this.#config.apiPort,
      });

      // Set up event listeners before starting
      this.#setupEventListeners();

      // Start the Grape server
      await new Promise((resolve, reject) => {
        this.#grape.start((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.#isStarted = true;

      this.#logger.system(LogLevel.INFO, 'Embedded Grape server started successfully', {
        dhtPort: this.#config.dhtPort,
        apiPort: this.#config.apiPort,
        bootstrapNodes: this.#config.bootstrapNodes,
      });
    } catch (error) {
      this.#logger.error(LogLevel.ERROR, 'Failed to start embedded Grape server', error, {
        dhtPort: this.#config.dhtPort,
        apiPort: this.#config.apiPort,
      });
      throw error;
    }
  }

  /**
   * Set up Grape event listeners
   * @private
   */
  #setupEventListeners() {
    if (!this.#grape) return;

    // Listen for DHT ready event
    this.#grape.on('ready', () => {
      this.#logger.system(LogLevel.INFO, 'Grape DHT is ready and bootstrapped');
    });

    // Listen for DHT listening event
    this.#grape.on('listening', () => {
      this.#logger.system(LogLevel.INFO, 'Grape DHT is listening for connections', {
        dhtPort: this.#config.dhtPort,
      });
    });

    // Listen for peer announcements
    this.#grape.on('announce', (key) => {
      this.#logger.network(LogLevel.DEBUG, 'Service announced in DHT', {
        service: key,
      });
    });

    // Listen for peer lookups
    this.#grape.on('lookup', (key) => {
      this.#logger.network(LogLevel.DEBUG, 'Service lookup in DHT', {
        service: key,
      });
    });

    // Listen for errors
    this.#grape.on('error', (error) => {
      this.#logger.error(LogLevel.ERROR, 'Grape server error', error);
    });
  }

  /**
   * Stop the embedded Grape server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.#isStarted || !this.#grape) {
      return;
    }

    try {
      await new Promise((resolve) => {
        this.#grape.stop(() => {
          resolve();
        });
      });

      this.#isStarted = false;
      this.#grape = null;

      this.#logger.system(LogLevel.INFO, 'Embedded Grape server stopped');
    } catch (error) {
      this.#logger.error(LogLevel.ERROR, 'Error stopping Grape server', error);
    }
  }

  /**
   * Check if Grape server is running
   * @returns {boolean}
   */
  get isStarted() {
    return this.#isStarted;
  }

  /**
   * Get Grape server configuration
   * @returns {Object}
   */
  get config() {
    return { ...this.#config };
  }

  /**
   * Get the HTTP API URL for this Grape server
   * @returns {string}
   */
  getApiUrl() {
    const host = this.#config.host || '127.0.0.1';
    return `http://${host}:${this.#config.apiPort}`;
  }
}
