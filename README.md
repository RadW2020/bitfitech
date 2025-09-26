# P2P Distributed Exchange

A simplified P2P distributed exchange implementation.

## 🏗️ Architecture

### Core Components

1. **OrderBook** (`src/orderbook.js`)
   - Simple matching engine with price-time priority
   - Handles buy/sell orders and trade execution
   - Manages order states (pending, filled, cancelled, partial)
   - Prevents race conditions with processing locks

2. **GrenacheService** (`src/grenache-service.js`)
   - P2P communication between exchange nodes
   - Order distribution and trade broadcasting
   - Message routing and handling
   - Service discovery and announcement

3. **ExchangeClient** (`src/exchange-client.js`)
   - Main interface for the distributed exchange
   - Combines OrderBook and GrenacheService
   - Handles order placement and distribution
   - Manages trade history and order tracking

### Key Features

- **ES Modules**: Modern JavaScript with ES6 imports/exports
- **Race Condition Prevention**: Processing locks in OrderBook
- **P2P Communication**: Grenache-based distributed architecture
- **Order Distribution**: Automatic order sharing between nodes
- **Trade Broadcasting**: Real-time trade notifications
- **Price-Time Priority**: Fair order matching algorithm

## 🚀 Getting Started

### Prerequisites

- Node.js 20.19.5+ (see `.nvmrc`)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Install Grenache Grape globally:
   ```bash
   npm install -g grenache-grape
   ```

### Running the Exchange

1. **Start Grape DHT nodes** (in separate terminals):

   ```bash
   # Terminal 1
   DEBUG="grenache:*" grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'

   # Terminal 2
   DEBUG="grenache:*" grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'
   ```

   Or use the provided script:

   ```bash
   npm run start:grapes
   ```

2. **Start the main exchange client**:

   ```bash
   npm start
   ```

3. **Start clients** (in separate terminals):
   ```bash
   node src/client.js client1
   node src/client.js client2
   node src/client.js client3
   ```

## 🔧 Configuration

### Environment Variables

- `GRAPE_URL`: Grenache grape URL (default: `http://127.0.0.1:30001`)
- `TRADING_PAIR`: Trading pair (default: `BTC/USD`)
- `USER_ID`: User identifier (auto-generated if not provided)

## 🧪 Testing

### Manual Testing

1. Start multiple clients in separate terminals
2. Place orders from different clients
3. Observe order distribution and matching
4. Check trade execution and orderbook updates

### Example Test Scenario

```bash
# Terminal 1: Start main exchange
npm start

# Terminal 2: Start client 1
node src/client.js client1

# Terminal 3: Start client 2
node src/client.js client2

# Terminal 4: Start client 3
node src/client.js client3
```

Each client will:

- Place random orders every 10 seconds
- Show current orderbook status
- Display trade history
- Handle order distribution from other clients

## 📈 Order Matching Algorithm

The exchange uses a **price-time priority** matching algorithm:

1. **Price Priority**: Orders are matched by price (best price first)
2. **Time Priority**: Within the same price, orders are matched by time (first in, first out)
3. **Partial Fills**: Orders can be partially filled, with remainder staying in the orderbook
4. **Trade Execution**: When orders match, trades are created and broadcast to all nodes

### Matching Rules

- **Buy Orders**: Match with sell orders at or below the buy price
- **Sell Orders**: Match with buy orders at or above the sell price
- **Trade Price**: Uses the price of the order already in the orderbook
- **Remainder**: Any unmatched portion stays in the orderbook

## 🔒 Race Condition Prevention

The implementation includes several mechanisms to prevent race conditions:

1. **Processing Locks**: OrderBook uses `#isProcessing` flag to prevent concurrent order processing
2. **Atomic Operations**: Order matching is performed atomically
3. **Message Ordering**: Grenache handles message ordering and delivery
4. **State Validation**: Orders are validated before processing

## 📚 Documentation

### JSDoc Documentation

The project includes comprehensive JSDoc documentation for all classes and methods.

#### Generate Documentation

```bash
# Generate JSDoc documentation
npm run docs
```

#### View Documentation

After running `npm run docs`, open `docs/index.html` in your browser to view the complete API documentation.
