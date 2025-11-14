/**
 * @fileoverview Main entry point for the P2P Exchange
 * @author Raul JM
 */

import ExchangeClient from './clients/exchange-client.js';
import EmbeddedGrapeServer from './services/embedded-grape-server.js';
import config from './utils/config.js';

/**
 * Main function to start the exchange client
 */
async function main() {
  let grapeServer = null;
  let exchange = null;

  try {
    console.log('🚀 Starting P2P Exchange Node...');
    console.log(`🌍 Environment: ${config.environment}`);
    console.log(`📊 Log Level: ${config.logging.level}`);

    // Step 1: Start embedded Grape server if enabled
    if (config.embeddedGrape.enabled) {
      console.log('🍇 Starting embedded Grape DHT server...');

      grapeServer = new EmbeddedGrapeServer({
        dhtPort: config.embeddedGrape.dhtPort,
        apiPort: config.embeddedGrape.apiPort,
        bootstrapNodes: config.embeddedGrape.bootstrapNodes,
        host: config.embeddedGrape.host,
      });

      await grapeServer.start();

      console.log('✅ Embedded Grape server started!');
      console.log(`   DHT Port: ${config.embeddedGrape.dhtPort}`);
      console.log(`   API Port: ${config.embeddedGrape.apiPort}`);
      console.log(`   API URL: ${grapeServer.getApiUrl()}`);
      if (config.embeddedGrape.bootstrapNodes.length > 0) {
        console.log(`   Bootstrap: ${config.embeddedGrape.bootstrapNodes.join(', ')}`);
      }

      // Wait a bit for DHT to bootstrap
      console.log('⏳ Waiting for DHT to bootstrap...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log('⚠️  Embedded Grape disabled - using external Grape servers');
      console.log(`   Grape URL: ${config.grenache.url}`);
    }

    // Step 2: Create and initialize exchange client
    console.log('📊 Starting Exchange Client...');

    exchange = new ExchangeClient({
      grapeUrl: grapeServer ? grapeServer.getApiUrl() : config.grenache.url,
      pair: config.exchange.pair,
      userId: 'user_' + Math.random().toString(36).substr(2, 9),
    });

    await exchange.initialize();

    console.log('\n✅ P2P Exchange Node is READY!');
    console.log('═'.repeat(50));
    console.log(`👤 User ID:     ${exchange.userId}`);
    console.log(`💱 Trading Pair: ${exchange.pair}`);
    console.log(`🔗 Node ID:     ${exchange.grenacheService.nodeId}`);
    console.log(`🍇 Grape Mode:  ${grapeServer ? 'Embedded (True P2P)' : 'External'}`);
    if (config.p2p.enabled) {
      console.log(`🌐 P2P Port:    ${config.p2p.port}`);
      console.log(`📡 mDNS:        ${config.p2p.enableMDNS ? 'Enabled' : 'Disabled'}`);
    }
    console.log('═'.repeat(50));
    console.log('🔄 Node running... Press Ctrl+C to exit\n');

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Shutting down P2P Exchange Node...');

      // Stop exchange client first
      if (exchange) {
        console.log('   Stopping exchange client...');
        exchange.destroy();
      }

      // Stop embedded Grape server
      if (grapeServer) {
        console.log('   Stopping embedded Grape server...');
        await grapeServer.stop();
      }

      console.log('✅ Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive with status updates
    setInterval(() => {
      console.log(
        `📊 Status - Orders: ${exchange.orderbook.orderCount}, Trades: ${exchange.orderbook.tradeCount}`
      );
    }, 30000); // Every 30 seconds
  } catch (error) {
    console.error('❌ Failed to start P2P Exchange Node:', error);

    // Cleanup on error
    if (exchange) {
      try {
        exchange.destroy();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    if (grapeServer) {
      try {
        await grapeServer.stop();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    process.exit(1);
  }
}

// Start the application
main().catch(console.error);
