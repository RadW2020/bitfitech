/**
 * Well-Known Bootstrap Nodes
 *
 * This file contains hardcoded bootstrap nodes for the P2P network.
 * Similar to Bitcoin's DNS seeds, these nodes help new nodes join the network.
 *
 * IMPORTANT: These are BOOTSTRAP nodes only - they help you discover other peers.
 * Once connected to the network, you don't need them anymore.
 *
 * Security Note:
 * - These nodes are operated by the community
 * - They CANNOT control your node or funds
 * - They only help with initial peer discovery
 * - Your node will remember other peers in .peers.json
 *
 * @author Raul JM
 */

/**
 * Well-known bootstrap nodes for different networks
 */
export const WELL_KNOWN_NODES = {
  /**
   * Mainnet bootstrap nodes
   * These are stable, community-run nodes for production use
   */
  mainnet: [
    // Format: 'host:port'
    // Add community bootstrap nodes here as the network grows
    // Example: 'bootstrap1.bitfitech.network:3000',
    // Example: 'bootstrap2.bitfitech.network:3000',
  ],

  /**
   * Testnet bootstrap nodes
   * For testing and development
   */
  testnet: [
    // Local testnet nodes
    '127.0.0.1:3001',
    '127.0.0.1:3002',
    'localhost:3001',
    'localhost:3002',
  ],

  /**
   * Local development nodes
   * For local testing with multiple instances
   */
  local: [
    '127.0.0.1:3001',
    '127.0.0.1:3002',
    '127.0.0.1:3003',
    '127.0.0.1:3004',
    '127.0.0.1:3005',
    'localhost:3001',
    'localhost:3002',
    'localhost:3003',
    'localhost:3004',
    'localhost:3005',
  ],
};

/**
 * Get bootstrap nodes for current environment
 * @param {string} network - Network name (mainnet, testnet, local)
 * @param {string[]} customNodes - Custom bootstrap nodes
 * @returns {string[]} Bootstrap nodes
 */
export function getBootstrapNodes(network = 'local', customNodes = []) {
  // Start with well-known nodes for the network
  const wellKnownNodes = WELL_KNOWN_NODES[network] || WELL_KNOWN_NODES.local;

  // Combine with custom nodes (custom nodes take priority)
  const allNodes = [...customNodes, ...wellKnownNodes];

  // Remove duplicates
  const uniqueNodes = [...new Set(allNodes)];

  // Filter out invalid nodes
  const validNodes = uniqueNodes.filter(node => {
    if (!node || typeof node !== 'string') return false;

    const parts = node.split(':');
    if (parts.length !== 2) return false;

    const [host, port] = parts;
    const portNum = parseInt(port, 10);

    return host && portNum >= 1000 && portNum <= 65535;
  });

  return validNodes;
}

/**
 * Check if a node is a well-known bootstrap node
 * @param {string} nodeAddress - Node address (host:port)
 * @param {string} network - Network name
 * @returns {boolean} True if well-known node
 */
export function isWellKnownNode(nodeAddress, network = 'local') {
  const wellKnownNodes = WELL_KNOWN_NODES[network] || [];
  return wellKnownNodes.includes(nodeAddress);
}

/**
 * Get recommended number of bootstrap nodes to connect to
 * @param {number} totalNodes - Total available bootstrap nodes
 * @returns {number} Recommended number to connect
 */
export function getRecommendedBootstrapCount(totalNodes) {
  // Connect to at least 3 bootstrap nodes, max 8
  return Math.min(Math.max(3, Math.floor(totalNodes * 0.5)), 8);
}

/**
 * Bootstrap node health check configuration
 */
export const BOOTSTRAP_CONFIG = {
  // Connection timeout for bootstrap nodes
  connectionTimeout: 10000, // 10 seconds

  // How often to retry failed bootstrap nodes
  retryInterval: 60000, // 1 minute

  // Maximum retries for a bootstrap node
  maxRetries: 3,

  // Minimum successful connections before considering network joined
  minSuccessfulConnections: 1,

  // Prefer recent nodes over bootstrap nodes
  preferRecentPeers: true,
};

/**
 * Community contribution guidelines for bootstrap nodes
 *
 * To add your node as a bootstrap node:
 *
 * 1. Requirements:
 *    - Stable internet connection (>99% uptime)
 *    - Public IP address or dynamic DNS
 *    - Open P2P port (default 3000)
 *    - Updated to latest version
 *
 * 2. Submit a Pull Request:
 *    - Add your node to the appropriate network (mainnet/testnet)
 *    - Include uptime monitoring URL (optional)
 *    - Include contact information for emergencies
 *
 * 3. Node format:
 *    'your-domain.com:3000' or 'ip.address:3000'
 *
 * 4. Monitoring:
 *    - Your node should log bootstrap requests
 *    - Monitor for unusual activity
 *    - Keep your node updated
 *
 * Bootstrap nodes are NOT special:
 * - They have no special privileges
 * - They cannot control other nodes
 * - They simply help with initial peer discovery
 * - Any node can become a bootstrap node
 */

export default {
  WELL_KNOWN_NODES,
  getBootstrapNodes,
  isWellKnownNode,
  getRecommendedBootstrapCount,
  BOOTSTRAP_CONFIG,
};
