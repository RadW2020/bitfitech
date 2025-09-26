# P2P Distributed Exchange - Bitfinex Challenge

> **Challenge**: Create a simplified P2P distributed exchange where each client has its own orderbook instance, orders are distributed between nodes using Grenache, and matching happens locally with remainder distribution.

## 🚀 Quick Start (30 seconds)

### 1. Install Dependencies

```bash
npm install
npm install -g grenache-grape
```

### 2. Start DHT Network

```bash
# Terminal 1
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'

# Terminal 2
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'
```

### 3. Start Exchange Nodes

```bash
# Terminal 3: Main exchange
npm start

# Terminal 4: Client 1
npm run start:client client1

# Terminal 5: Client 2
npm run start:client client2
```

## ✅ Challenge Requirements Met

- ✅ **P2P Architecture**: Each client has own orderbook instance
- ✅ **Grenache Communication**: Order distribution between nodes
- ✅ **Order Matching**: Simple matching engine with price-time priority
- ✅ **JavaScript**: Modern ES modules implementation
- ✅ **No UI/HTTP API**: Console-based interface
- ✅ **Remainder Handling**: Unmatched portions stay in orderbook

## 🔧 How It Works

1. **Order Placement**: Client submits order to local orderbook
2. **Distribution**: Order is broadcast to all other nodes via Grenache
3. **Local Matching**: Each node attempts to match against its local orderbook
4. **Trade Execution**: Matching orders create trades, broadcast to network
5. **Remainder Handling**: Unmatched portions remain in orderbook

## 🧪 Testing

```bash
# Run comprehensive test suite
npm test

# Run with coverage
npm run test:coverage
```

## 📊 Key Features

- **Decimal Precision**: Financial-grade accuracy with decimal.js
- **Race Condition Prevention**: Processing locks prevent concurrent modifications
- **Price-Time Priority**: Fair FIFO matching within price levels
- **Distributed Consensus**: Vector clocks for event ordering
- **Fault Tolerance**: Circuit breaker pattern for network resilience

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client A      │    │   Client B      │    │   Client C      │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ OrderBook   │ │    │ │ OrderBook   │ │    │ │ OrderBook   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Grenache    │◄┼────┼►│ Grenache    │◄┼────┼►│ Grenache    │ │
│ │ Service     │ │    │ │ Service     │ │    │ │ Service     │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────┐
                    │   Grenache DHT      │
                    │  (Grape Network)    │
                    └─────────────────────┘
```

## 🔍 Project Structure

```
src/
├── index.js                    # Main entry point
├── clients/
│   ├── exchange-client.js      # Main exchange interface
│   └── example-client.js       # Demo client implementation
├── core/
│   └── orderbook.js           # Order matching engine
├── services/
│   └── grenache-service.js    # P2P communication
└── utils/                      # Supporting utilities
```

## JSDoc Documentation

The project includes comprehensive JSDoc documentation for all classes and methods.

#### Generate Documentation

```bash
# Generate JSDoc documentation
npm run docs
```

This will create documentation in the `docs/` directory.

#### View Documentation

After running `npm run docs`, open `docs/index.html` in your browser to view the complete API documentation.
