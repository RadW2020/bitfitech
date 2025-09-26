/**
 * @fileoverview Main entry point for the P2P Exchange
 * @author Raul JM
 */

import ExchangeClient from './exchange-client.js';

/**
 * Main function to start the exchange client
 */
async function main() {
  try {
    console.log('🚀 Starting P2P Exchange Client...');

    // Create exchange client
    const exchange = new ExchangeClient({
      grapeUrl: 'http://127.0.0.1:30001',
      pair: 'BTC/USD',
      userId: 'user_' + Math.random().toString(36).substr(2, 9),
    });

    // Initialize the exchange
    await exchange.initialize();

    console.log('✅ Exchange client started successfully!');
    console.log(`👤 User ID: ${exchange.userId}`);
    console.log(`💱 Trading Pair: ${exchange.pair}`);
    console.log(`🔗 Node ID: ${exchange.grenacheService.nodeId}`);
    console.log('🔄 Exchange client running... Press Ctrl+C to exit');

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down exchange client...');
      exchange.destroy();
      process.exit(0);
    });

    // Keep process alive
    setInterval(() => {
      console.log(
        `📊 Status - Orders: ${exchange.orderbook.orderCount}, Trades: ${exchange.orderbook.tradeCount}`
      );
    }, 30000); // Every 30 seconds
  } catch (error) {
    console.error('❌ Failed to start exchange client:', error);
    process.exit(1);
  }
}

// Start the application
main().catch(console.error);
