# P2P Distributed Exchange

A simplified P2P distributed exchange implementation.

## 🏗️ Architecture

### Core Components

1. **OrderBook** (`src/core/orderbook.js`)
   - High-performance matching engine with price-time priority
   - Decimal precision for financial accuracy
   - O(log n) insertion and matching
   - Handles buy/sell orders and trade execution
   - Manages order states (pending, filled, cancelled, partial)
   - Prevents race conditions with processing locks

2. **GrenacheService** (`src/services/grenache-service.js`)
   - P2P communication between exchange nodes
   - Order distribution and trade broadcasting
   - Message routing and handling
   - Service discovery and announcement
   - Circuit breaker pattern for resilience

3. **ExchangeClient** (`src/clients/exchange-client.js`)
   - Main interface for the distributed exchange
   - Combines OrderBook and GrenacheService
   - Handles order placement and distribution
   - Manages trade history and order tracking

### Key Features

- **ES Modules**: Modern JavaScript with ES6 imports/exports
- **High-Performance**: O(log n) matching with Decimal precision
- **Circuit Breaker**: Resilience against cascade failures
- **Structured Logging**: JSON logs with Pino and log rotation
- **Configuration Management**: Environment-based configuration
- **Error Handling**: Custom error classes with context and recovery
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
   npm run start:client client1
   npm run start:client client2
   npm run start:client client3
   ```

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and customize as needed:

```bash
cp .env.example .env
```

#### Key Configuration Options

- `NODE_ENV`: Environment (development, production, test)
- `LOG_LEVEL`: Logging level (trace, debug, info, warn, error, fatal)
- `GRAPE_URL`: Grenache grape URL (default: `http://127.0.0.1:30001`)
- `EXCHANGE_PAIR`: Trading pair (default: `BTC/USD`)
- `PERFORMANCE_THRESHOLD_MS`: Performance monitoring threshold
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD`: Circuit breaker failure threshold
- `MAX_ORDER_AMOUNT`: Maximum order amount
- `MAX_ORDER_PRICE`: Maximum order price

See `.env.example` for complete configuration options.

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
npm run start:client client1

# Terminal 3: Start client 2
npm run start:client client2

# Terminal 4: Start client 3
npm run start:client client3
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

## 🧪 Testing

### Unit Tests

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Manual Testing

1. Start multiple clients in separate terminals
2. Observe order distribution and matching
3. Check trade execution and orderbook updates

### Example Test Scenario

```bash
# Terminal 1: Start main exchange
npm start

# Terminal 2: Start client 1
npm run start:client client1

# Terminal 3: Start client 2
npm run start:client client2

# Terminal 4: Start client 3
npm run start:client client3
```

Each client will:

- Place random orders every 10 seconds
- Show current orderbook status
- Display trade history
- Handle order distribution from other clients

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

## 🏗️ Project Structure

```
src/
├── index.js                    # Entry point
├── clients/                    # Client implementations
│   ├── exchange-client.js      # Main exchange client
│   └── example-client.js       # Example client for testing
├── core/                       # Core business logic
│   └── orderbook.js           # High-performance order matching
├── services/                   # Infrastructure services
│   └── grenache-service.js    # P2P communication service
└── utils/                      # Utilities and tools
    ├── config.js              # Configuration management
    ├── logger.js              # Structured logging
    ├── errors.js              # Custom error classes
    └── circuit-breaker.js     # Circuit breaker pattern

test/
├── clients/                    # Client tests
├── core/                       # Core logic tests
├── services/                   # Service tests
└── utils/                      # Utility tests
```
