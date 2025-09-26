/**
 * @fileoverview Example client for testing the P2P Exchange
 * @author Raul JM
 */

import ExchangeClient from './exchange-client.js';
import { setTimeout } from 'node:timers/promises';
import config from '../utils/config.js';

/**
 * Example client that demonstrates the P2P exchange functionality
 */
class ExampleClient {
  #exchange = null;
  #userId = null;

  constructor(userId) {
    this.#userId = userId;
    this.#exchange = new ExchangeClient({
      grapeUrl: config.grenache.url,
      pair: config.exchange.pair,
      userId: this.#userId,
    });
  }

  /**
   * Initialize the client
   */
  async initialize() {
    await this.#exchange.initialize();
    console.log(`🚀 Client ${this.#userId} initialized`);
  }

  /**
   * Run example trading scenario
   */
  async runExample() {
    console.log(`\n🎯 Running example scenario for client ${this.#userId}...`);

    try {
      // Place some buy orders
      console.log('\n📈 Placing buy orders...');
      await this.#exchange.placeBuyOrder('2.0', '49000');
      await setTimeout(1000);
      await this.#exchange.placeBuyOrder('1.5', '49500');
      await setTimeout(1000);
      await this.#exchange.placeBuyOrder('1.0', '50000');

      // Place some sell orders
      console.log('\n📉 Placing sell orders...');
      await this.#exchange.placeSellOrder('1.0', '51000');
      await setTimeout(1000);
      await this.#exchange.placeSellOrder('1.5', '51500');
      await setTimeout(1000);
      await this.#exchange.placeSellOrder('2.0', '52000');

      // Show results
      console.log('\n📊 OrderBook:');
      const orderbook = this.#exchange.getOrderBook(5);
      console.log(JSON.stringify(orderbook, null, 2));

      console.log('\n📋 User Orders:');
      const userOrders = this.#exchange.getUserOrders();
      console.log(JSON.stringify(userOrders, null, 2));

      console.log('\n💰 Recent Trades:');
      const trades = this.#exchange.getRecentTrades(10);
      console.log(JSON.stringify(trades, null, 2));
    } catch (error) {
      console.error('❌ Error in example scenario:', error);
    }
  }

  /**
   * Place a random order
   */
  async placeRandomOrder() {
    const side = Math.random() > 0.5 ? 'buy' : 'sell';
    const amount = (Math.random() * 5 + 0.1).toFixed(2);
    const price = (Math.random() * 10000 + 45000).toFixed(0);

    console.log(`\n🎲 Placing random ${side} order: ${amount} @ ${price}`);

    try {
      const result =
        side === 'buy'
          ? await this.#exchange.placeBuyOrder(amount, price)
          : await this.#exchange.placeSellOrder(amount, price);
      console.log(`✅ Order result:`, result);
    } catch (error) {
      console.error('❌ Error placing random order:', error);
    }
  }

  /**
   * Show current status
   */
  showStatus() {
    console.log(`\n📊 Status for client ${this.#userId}:`);
    console.log(`Orders: ${this.#exchange.orderbook.orderCount}`);
    console.log(`Trades: ${this.#exchange.orderbook.tradeCount}`);

    const orderbook = this.#exchange.getOrderBook(3);
    console.log('Top 3 bids:', orderbook.bids);
    console.log('Top 3 asks:', orderbook.asks);
  }

  /**
   * Destroy the client
   */
  destroy() {
    this.#exchange.destroy();
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const userId = args[0] || 'client_' + Math.random().toString(36).substr(2, 9);

  console.log(`🚀 Starting example client: ${userId}`);

  const client = new ExampleClient(userId);

  try {
    await client.initialize();

    // Run example scenario
    await client.runExample();

    // Keep running and place random orders
    console.log('\n🔄 Client running... Press Ctrl+C to exit');

    // Place random orders every 10 seconds
    const interval = setInterval(async () => {
      await client.placeRandomOrder();
      client.showStatus();
    }, 10000);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down client...');
      clearInterval(interval);
      client.destroy();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start client:', error);
    process.exit(1);
  }
}

// Start the client
main().catch(console.error);
