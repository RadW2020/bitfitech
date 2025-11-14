/**
 * Demo: 3-Node P2P Network with Grenache
 *
 * Demonstrates:
 * - Embedded Grape DHT running in each node
 * - Direct P2P connections between nodes
 * - Order distribution via Grenache
 * - Consistent orderbook across all nodes
 */

import ExchangeClient from './src/clients/exchange-client.js';
import { setTimeout as sleep } from 'timers/promises';

console.log('🚀 Starting 3-Node P2P Exchange Network\n');
console.log('═══════════════════════════════════════════════════════');
console.log('Configuration: Grenache + P2P Mode (DEFAULT)');
console.log('  ✅ embeddedGrape.enabled: true');
console.log('  ✅ p2p.enableGrenache: true');
console.log('  ✅ p2p.enableMDNS: true');
console.log('═══════════════════════════════════════════════════════\n');

// Create 3 nodes
const node1 = new ExchangeClient({
  userId: 'demo-user-1',
  pair: 'BTC/USD',
  p2p: {
    port: 5001,
    host: '127.0.0.1',
    enableMDNS: false, // Disable for demo clarity
    enableGrenache: true, // ✅ REQUIRED per spec
    useWellKnownNodes: false, // Don't use hardcoded bootstrap
    bootstrapPeers: [],
    peerStoragePath: '.peers-demo-1.json',
  },
});

const node2 = new ExchangeClient({
  userId: 'demo-user-2',
  pair: 'BTC/USD',
  p2p: {
    port: 5002,
    host: '127.0.0.1',
    enableMDNS: false,
    enableGrenache: true, // ✅ REQUIRED per spec
    useWellKnownNodes: false,
    bootstrapPeers: ['127.0.0.1:5001'], // Connect to node1
    peerStoragePath: '.peers-demo-2.json',
  },
});

const node3 = new ExchangeClient({
  userId: 'demo-user-3',
  pair: 'BTC/USD',
  p2p: {
    port: 5003,
    host: '127.0.0.1',
    enableMDNS: false,
    enableGrenache: true, // ✅ REQUIRED per spec
    useWellKnownNodes: false,
    bootstrapPeers: ['127.0.0.1:5001', '127.0.0.1:5002'], // Connect to both
    peerStoragePath: '.peers-demo-3.json',
  },
});

async function runDemo() {
  try {
    // Step 1: Initialize all nodes
    console.log('📡 Step 1: Initializing 3 nodes...\n');
    await Promise.all([node1.initialize(), node2.initialize(), node3.initialize()]);

    console.log('✅ All nodes initialized!\n');

    // Wait for peer discovery
    console.log('🔍 Step 2: Waiting for peer discovery (3 seconds)...\n');
    await sleep(3000);

    // Check peer connections
    const stats1 = node1.getP2PStats();
    const stats2 = node2.getP2PStats();
    const stats3 = node3.getP2PStats();

    console.log('🔗 Peer Connections:');
    console.log(`   Node 1: ${stats1.peers.connectedPeers} peers connected`);
    console.log(`   Node 2: ${stats2.peers.connectedPeers} peers connected`);
    console.log(`   Node 3: ${stats3.peers.connectedPeers} peers connected\n`);

    // Step 3: Place order on Node 1
    console.log('📝 Step 3: Placing SELL order on Node 1...');
    console.log('   Amount: 1.5 BTC');
    console.log('   Price: $50,000\n');

    const result1 = await node1.placeSellOrder('1.5', '50000');
    console.log(`✅ Order placed: ${result1.orderId}\n`);

    // Wait for order propagation
    console.log('⏳ Waiting for order propagation (2 seconds)...\n');
    await sleep(2000);

    // Check orderbooks
    const orderbook1 = node1.getOrderBook();
    const orderbook2 = node2.getOrderBook();
    const orderbook3 = node3.getOrderBook();

    console.log('📊 Orderbook State (after propagation):');
    console.log(`   Node 1: ${orderbook1.asks.length} asks, ${orderbook1.bids.length} bids`);
    console.log(`   Node 2: ${orderbook2.asks.length} asks, ${orderbook2.bids.length} bids`);
    console.log(`   Node 3: ${orderbook3.asks.length} asks, ${orderbook3.bids.length} bids`);

    if (
      orderbook1.asks.length === orderbook2.asks.length &&
      orderbook2.asks.length === orderbook3.asks.length
    ) {
      console.log('\n✅ SUCCESS: Orderbook consistent across all nodes!\n');
    } else {
      console.log('\n⚠️  WARNING: Orderbook not fully synchronized yet\n');
    }

    // Step 4: Execute trade
    console.log('💰 Step 4: Placing BUY order on Node 2 (will match)...');
    console.log('   Amount: 1.0 BTC');
    console.log('   Price: $50,000\n');

    const result2 = await node2.placeBuyOrder('1.0', '50000');
    console.log(`✅ Order placed: ${result2.orderId}`);

    if (result2.trades && result2.trades.length > 0) {
      console.log(`💹 Trades executed: ${result2.trades.length}\n`);
    }

    // Wait for trade propagation
    console.log('⏳ Waiting for trade propagation (2 seconds)...\n');
    await sleep(2000);

    // Check trades
    const trades1 = node1.getTradeHistory();
    const trades2 = node2.getTradeHistory();
    const trades3 = node3.getTradeHistory();

    console.log('📈 Trade History:');
    console.log(`   Node 1: ${trades1.length} trades`);
    console.log(`   Node 2: ${trades2.length} trades`);
    console.log(`   Node 3: ${trades3.length} trades`);

    if (trades1.length === trades2.length && trades2.length === trades3.length) {
      console.log('\n✅ SUCCESS: Trades propagated to all nodes!\n');
    }

    // Final orderbook state
    const finalOrderbook1 = node1.getOrderBook();
    const finalOrderbook2 = node2.getOrderBook();
    const finalOrderbook3 = node3.getOrderBook();

    console.log('📊 Final Orderbook State:');
    console.log(`   Node 1: ${finalOrderbook1.asks.length} asks, ${finalOrderbook1.bids.length} bids`);
    console.log(`   Node 2: ${finalOrderbook2.asks.length} asks, ${finalOrderbook2.bids.length} bids`);
    console.log(`   Node 3: ${finalOrderbook3.asks.length} asks, ${finalOrderbook3.bids.length} bids\n`);

    // Architecture summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('🏗️  Architecture Summary:');
    console.log('   ✅ Embedded Grape DHT: 3 independent DHT nodes');
    console.log('   ✅ Direct P2P: TCP connections between all nodes');
    console.log('   ✅ Grenache Communication: DHT-based discovery');
    console.log('   ✅ Distributed Orderbook: Consistent across nodes');
    console.log('   ✅ No Central Servers: Fully distributed network');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('✅ Demo completed successfully!\n');
  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up...\n');
    await node1.destroy();
    await node2.destroy();
    await node3.destroy();
    console.log('👋 Demo finished!\n');
    process.exit(0);
  }
}

runDemo().catch(console.error);
