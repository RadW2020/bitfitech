/**
 * Pure P2P Integration Test
 *
 * Tests the exchange running in pure P2P mode WITHOUT Grenache.
 * This demonstrates true P2P functionality with direct TCP connections.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExchangeClient from '../../src/clients/exchange-client.js';
import { setTimeout as sleep } from 'timers/promises';

describe('Pure P2P Mode (No Grenache)', () => {
  let client1, client2, client3;

  beforeAll(async () => {
    // Create 3 clients in pure P2P mode (Grenache disabled)
    // P2P is always enabled now, just configure discovery
    client1 = new ExchangeClient({
      userId: 'pure-p2p-user-1',
      pair: 'BTC/USD',
      p2p: {
        port: 13001,
        host: '127.0.0.1',
        enableMDNS: false, // Disable for tests
        enableGrenache: false, // NO GRENACHE!
        bootstrapPeers: [], // Will connect manually
        peerStoragePath: '.peers-test-1.json',
      },
      grenache: {
        url: 'http://invalid:99999', // Invalid URL - should fail
      },
    });

    client2 = new ExchangeClient({
      userId: 'pure-p2p-user-2',
      pair: 'BTC/USD',
      p2p: {
        port: 13002,
        host: '127.0.0.1',
        enableMDNS: false,
        enableGrenache: false, // NO GRENACHE!
        bootstrapPeers: ['127.0.0.1:13001'], // Connect to client1
        peerStoragePath: '.peers-test-2.json',
      },
      grenache: {
        url: 'http://invalid:99999',
      },
    });

    client3 = new ExchangeClient({
      userId: 'pure-p2p-user-3',
      pair: 'BTC/USD',
      p2p: {
        port: 13003,
        host: '127.0.0.1',
        enableMDNS: false,
        enableGrenache: false, // NO GRENACHE!
        bootstrapPeers: ['127.0.0.1:13001', '127.0.0.1:13002'], // Connect to both
        peerStoragePath: '.peers-test-3.json',
      },
      grenache: {
        url: 'http://invalid:99999',
      },
    });

    // Initialize all clients
    await Promise.all([client1.initialize(), client2.initialize(), client3.initialize()]);

    // Wait for peers to discover and connect
    await sleep(2000);

    console.log('\n🔗 Pure P2P Network Initialized');
    console.log(`Client 1 peers: ${client1.getP2PStats().peers.connectedPeers || 0}`);
    console.log(`Client 2 peers: ${client2.getP2PStats().peers.connectedPeers || 0}`);
    console.log(`Client 3 peers: ${client3.getP2PStats().peers.connectedPeers || 0}`);
  });

  afterAll(async () => {
    await Promise.all([client1.destroy(), client2.destroy(), client3.destroy()]);
  });

  it('should initialize without Grenache', () => {
    expect(client1.isInitialized).toBe(true);
    expect(client2.isInitialized).toBe(true);
    expect(client3.isInitialized).toBe(true);

    // Verify Grenache is NOT available (P2P is always enabled)
    const stats1 = client1.getP2PStats();
    const stats2 = client2.getP2PStats();
    const stats3 = client3.getP2PStats();

    expect(stats1.hasGrenache).toBe(false);
    expect(stats2.hasGrenache).toBe(false);
    expect(stats3.hasGrenache).toBe(false);

    // P2P is always enabled now - no need to check
    expect(stats1.peers).toBeDefined();
    expect(stats2.peers).toBeDefined();
    expect(stats3.peers).toBeDefined();
  });

  it('should establish direct peer connections', () => {
    const stats1 = client1.getP2PStats();
    const stats2 = client2.getP2PStats();
    const stats3 = client3.getP2PStats();

    // Client 1 should be connected to client 2 and 3
    expect(stats1.peers.connectedPeers).toBeGreaterThan(0);

    // Client 2 should be connected to at least client 1
    expect(stats2.peers.connectedPeers).toBeGreaterThan(0);

    // Client 3 should be connected to client 1 and 2
    expect(stats3.peers.connectedPeers).toBeGreaterThan(0);

    console.log('\n✅ Direct P2P connections established');
  });

  it('should propagate orders across P2P network', async () => {
    // Client 1 places a sell order
    const result1 = await client1.placeSellOrder('1.5', '50000');
    expect(result1.success).toBe(true);

    console.log(`\n📝 Client 1 placed sell order: ${result1.orderId}`);

    // Wait for propagation
    await sleep(1000);

    // Verify order appears in all orderbooks
    const orderbook1 = client1.getOrderBook();
    const orderbook2 = client2.getOrderBook();
    const orderbook3 = client3.getOrderBook();

    expect(orderbook1.asks.length).toBeGreaterThan(0);
    expect(orderbook2.asks.length).toBeGreaterThan(0);
    expect(orderbook3.asks.length).toBeGreaterThan(0);

    console.log(`✅ Order propagated to all peers`);
    console.log(`   Client 1 orderbook: ${orderbook1.asks.length} asks`);
    console.log(`   Client 2 orderbook: ${orderbook2.asks.length} asks`);
    console.log(`   Client 3 orderbook: ${orderbook3.asks.length} asks`);
  });

  it('should execute trades across P2P network', async () => {
    // Client 2 places a buy order that matches client 1's sell
    const result2 = await client2.placeBuyOrder('1.0', '50000');

    console.log(`\n💰 Client 2 placed buy order: ${result2.orderId}`);
    console.log(`   Trades executed: ${result2.trades.length}`);

    expect(result2.success).toBe(true);
    expect(result2.trades.length).toBeGreaterThan(0);

    // Wait for trade propagation
    await sleep(1000);

    // Verify trades appear in all clients
    const trades1 = client1.getRecentTrades();
    const trades2 = client2.getRecentTrades();
    const trades3 = client3.getRecentTrades();

    expect(trades1.length).toBeGreaterThan(0);
    expect(trades2.length).toBeGreaterThan(0);
    expect(trades3.length).toBeGreaterThan(0);

    console.log(`✅ Trade propagated to all peers`);
    console.log(`   Client 1 trades: ${trades1.length}`);
    console.log(`   Client 2 trades: ${trades2.length}`);
    console.log(`   Client 3 trades: ${trades3.length}`);
  });

  it('should maintain consistent orderbook state', async () => {
    const orderbook1 = client1.getOrderBook();
    const orderbook2 = client2.getOrderBook();
    const orderbook3 = client3.getOrderBook();

    // All orderbooks should have the same number of asks and bids
    expect(orderbook1.asks.length).toBe(orderbook2.asks.length);
    expect(orderbook2.asks.length).toBe(orderbook3.asks.length);

    expect(orderbook1.bids.length).toBe(orderbook2.bids.length);
    expect(orderbook2.bids.length).toBe(orderbook3.bids.length);

    console.log(`\n📊 Orderbook state consistent across all peers`);
    console.log(`   Asks: ${orderbook1.asks.length}, Bids: ${orderbook1.bids.length}`);
  });

  it('should report P2P statistics', () => {
    const stats1 = client1.getP2PStats();
    const stats2 = client2.getP2PStats();
    const stats3 = client3.getP2PStats();

    console.log('\n📈 P2P Statistics (P2P always enabled):');
    console.log('\nClient 1:');
    console.log(`  Has Grenache: ${stats1.hasGrenache}`);
    console.log(`  Connected Peers: ${stats1.peers.connectedPeers}`);
    console.log(`  Healthy Peers: ${stats1.peers.healthyPeers}`);
    console.log(`  Direct Connections: ${stats1.directConnection.connections}`);

    console.log('\nClient 2:');
    console.log(`  Has Grenache: ${stats2.hasGrenache}`);
    console.log(`  Connected Peers: ${stats2.peers.connectedPeers}`);
    console.log(`  Healthy Peers: ${stats2.peers.healthyPeers}`);
    console.log(`  Direct Connections: ${stats2.directConnection.connections}`);

    console.log('\nClient 3:');
    console.log(`  Has Grenache: ${stats3.hasGrenache}`);
    console.log(`  Connected Peers: ${stats3.peers.connectedPeers}`);
    console.log(`  Healthy Peers: ${stats3.peers.healthyPeers}`);
    console.log(`  Direct Connections: ${stats3.directConnection.connections}`);

    // Verify P2P components are present
    expect(stats1.peers).toBeDefined();
    expect(stats2.peers).toBeDefined();
    expect(stats3.peers).toBeDefined();
  });
});
