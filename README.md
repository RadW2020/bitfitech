# P2P Distributed Exchange

**🎯 TRUE Peer-to-Peer Exchange** - Now with **embedded Kademlia DHT**, **zero external dependencies**, and **fully distributed architecture**.

## 🚀 What's New: REAL P2P with Embedded Grape DHT

This is now a **TRUE P2P system** where each node runs its own Grape DHT server!

### Architecture Modes:

1. **⭐ Embedded Grape (TRUE P2P)** - RECOMMENDED
   - Each node runs its own Grape DHT server
   - Kademlia DHT (same as BitTorrent)
   - Zero external infrastructure
   - **This is what makes it REAL P2P!**

2. **🔥 Pure P2P Mode** (Without DHT) - Simple
   - Direct TCP connections only
   - mDNS + Bootstrap peers
   - Good for small networks

3. **⚡ Legacy Mode** (External Grape) - Not recommended
   - Requires manual Grape servers
   - Centralized discovery (NOT true P2P)

**Embedded Grape is enabled by default** - you get true P2P out of the box!

### Key Features

- ✅ **Embedded Kademlia DHT** - Each node runs its own Grape server (TRUE P2P!)
- ✅ **Direct TCP peer-to-peer connections** - No central servers required
- ✅ **Distributed peer discovery** - Kademlia protocol (same as BitTorrent)
- ✅ **mDNS local network discovery** - Zero-config on LANs
- ✅ **Peer exchange protocol** - Exponential peer discovery
- ✅ **Automatic peer reconnection** - Resilient network
- ✅ **Persistent peer storage** - Remembers peers across restarts
- ✅ **No single point of failure** - Fully distributed system

## 🚀 Quick Start

### Option A: Embedded Grape DHT (TRUE P2P) - ⭐ RECOMMENDED

**Each node runs its own Grape DHT server** - forming a distributed Kademlia network.

```bash
# 1. Install dependencies
npm install

# 2. Start Node 1 (Bootstrap node)
GRAPE_DHT_PORT=20001 GRAPE_API_PORT=30001 P2P_PORT=3001 npm start

# 3. Start Node 2 (Connects to Node 1's DHT)
GRAPE_DHT_PORT=20002 GRAPE_API_PORT=30002 GRAPE_BOOTSTRAP_NODES=127.0.0.1:20001 P2P_PORT=3002 npm start

# 4. Start Node 3 (Connects to existing DHT)
GRAPE_DHT_PORT=20003 GRAPE_API_PORT=30003 GRAPE_BOOTSTRAP_NODES=127.0.0.1:20001,127.0.0.1:20002 P2P_PORT=3003 npm start
```

**What happens:**
- ✅ Each node runs its own Grape DHT server (Kademlia)
- ✅ Nodes form a distributed DHT network
- ✅ Zero external infrastructure required
- ✅ **THIS IS TRUE P2P!** No central servers, fully distributed

See [EMBEDDED_GRAPE_DHT.md](./EMBEDDED_GRAPE_DHT.md) for detailed documentation.

### Option B: Pure P2P Mode (Without DHT)

**Direct TCP connections only** - good for simple/small networks.

```bash
# 1. Install dependencies
npm install

# 2. Start first node (disable embedded Grape)
EMBEDDED_GRAPE=false P2P_PORT=3001 DISCOVERY_GRENACHE=false npm start

# 3. Start second node (connects to first)
EMBEDDED_GRAPE=false P2P_PORT=3002 BOOTSTRAP_PEERS=127.0.0.1:3001 DISCOVERY_GRENACHE=false npm start

# 4. Start third node (connects to both)
EMBEDDED_GRAPE=false P2P_PORT=3003 BOOTSTRAP_PEERS=127.0.0.1:3001,127.0.0.1:3002 DISCOVERY_GRENACHE=false npm start
```

**What happens:**
- Uses mDNS + bootstrap peers for discovery
- No DHT (less scalable)
- Good for small, local networks

### Option C: Legacy Mode (External Grape) - ❌ NOT RECOMMENDED

**Requires manual Grape servers** - this is NOT true P2P (centralized discovery).

```bash
# 1. Install Grape CLI
npm install -g grenache-grape

# 2. Manually start Grape servers
grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'

# 3. Start nodes with embedded Grape disabled
EMBEDDED_GRAPE=false GRAPE_URL=http://127.0.0.1:30001 P2P_PORT=3001 npm start
EMBEDDED_GRAPE=false GRAPE_URL=http://127.0.0.1:30001 P2P_PORT=3002 npm start
```

## 🔧 How It Works

### Pure P2P Mode

1. **Peer Discovery**: Nodes find each other through:
   - Bootstrap peers (manual configuration)
   - mDNS (local network, zero-config)
   - Peer exchange (peers share peer lists)
   - Persisted peers (reconnection to known peers)

2. **Direct Connections**: Nodes establish direct TCP connections to peers

3. **Order Placement**: Client submits order to local orderbook

4. **P2P Distribution**: Order is broadcast directly to all connected peers

5. **Local Matching**: Each node attempts to match against its local orderbook

6. **Trade Execution**: Matching orders create trades, broadcast via P2P

7. **Peer Maintenance**:
   - Automatic heartbeat monitoring
   - Reconnection to disconnected peers
   - Peer reputation tracking

### Hybrid Mode

Same as Pure P2P, but also uses Grenache DHT for:
- Faster peer discovery
- Redundant message delivery
- Fallback communication channel

## 🧪 Testing

```bash
# Run comprehensive test suite
npm test

# Run with coverage
npm run test:coverage

# Run integration test
npm run test:integration

# Test pure P2P mode (no Grenache)
npm run test -- test/integration/pure-p2p.test.js
```

## ⚙️ P2P Configuration

Configure via environment variables (see `.env.example`):

```bash
# P2P Settings (Always Enabled)
P2P_PORT=3000                       # TCP port for P2P connections
P2P_HOST=0.0.0.0                    # Bind address

# Peer Discovery
DISCOVERY_MDNS=true                 # Enable mDNS (local network)
DISCOVERY_GRENACHE=true             # Enable Grenache discovery
BOOTSTRAP_PEERS=                    # Comma-separated peers (host:port)

# Peer Management
PEER_STORAGE_PATH=.peers.json       # Peer persistence file
MAX_PEERS=50                        # Maximum peer connections
PEER_RECONNECT_INTERVAL=30000       # Reconnection interval (ms)

# Grenache (optional)
GRAPE_URL=http://127.0.0.1:30001   # Grenache URL (only if DISCOVERY_GRENACHE=true)
```

### Example Configurations

**Pure P2P (no Grenache):**
```bash
DISCOVERY_GRENACHE=false
BOOTSTRAP_PEERS=192.168.1.100:3000,192.168.1.101:3000
```

**Hybrid (P2P + Grenache):**
```bash
DISCOVERY_GRENACHE=true
DISCOVERY_MDNS=true
GRAPE_URL=http://127.0.0.1:30001
```

## 📊 Key Features

- **🔒 Truly Decentralized**: No central servers or single points of failure
- **🔌 Direct P2P Connections**: TCP connections directly between peers
- **🔍 Multi-Strategy Discovery**: mDNS, bootstrap, peer exchange, Grenache
- **💾 Peer Persistence**: Automatic reconnection to known peers
- **💪 Resilient**: Automatic peer reconnection and heartbeat monitoring
- **⚡ Hybrid Routing**: Direct connections with Grenache fallback
- **Decimal Precision**: Financial-grade accuracy with decimal.js
- **Race Condition Prevention**: Processing locks prevent concurrent modifications
- **Price-Time Priority**: Fair FIFO matching within price levels
- **Distributed Consensus**: Vector clocks for event ordering
- **Fault Tolerance**: Circuit breaker pattern for network resilience

## 🏗️ Architecture

### New Hybrid P2P Architecture

```
┌─────────────────────────┐      ┌─────────────────────────┐
│      Node A             │      │      Node B             │
│ ┌─────────────────────┐ │      │ ┌─────────────────────┐ │
│ │   OrderBook         │ │      │ │   OrderBook         │ │
│ └─────────────────────┘ │      │ └─────────────────────┘ │
│ ┌─────────────────────┐ │      │ ┌─────────────────────┐ │
│ │  MessageRouter      │ │      │ │  MessageRouter      │ │
│ │  - Direct P2P       │ │      │ │  - Direct P2P       │ │
│ │  - Grenache (opt)   │ │      │ │  - Grenache (opt)   │ │
│ └─────────────────────┘ │      │ └─────────────────────┘ │
│ ┌─────────────────────┐ │      │ ┌─────────────────────┐ │
│ │  PeerManager        │ │      │ │  PeerManager        │ │
│ └─────────────────────┘ │      │ └─────────────────────┘ │
│ ┌─────────────────────┐ │      │ ┌─────────────────────┐ │
│ │  Direct Connection  │ │◄─────┼►│  Direct Connection  │ │
│ │  TCP Server         │ │      │ │  TCP Server         │ │
│ └─────────────────────┘ │      │ └─────────────────────┘ │
└─────────────────────────┘      └─────────────────────────┘
         ▲                                    ▲
         │    Direct TCP Connections          │
         └────────────────┬───────────────────┘
                          │
                ┌─────────▼────────┐
                │    Node C        │
                │  (Same structure)│
                └──────────────────┘

Optional Grenache DHT (for discovery acceleration):
                ┌─────────────────────┐
                │   Grenache DHT      │
                │  (Grape Network)    │
                └─────────────────────┘
```

### Discovery Flow

```
Node Startup → Load Persisted Peers → Try Bootstrap Peers
                     ↓                        ↓
              mDNS Discovery ← Peer Exchange → Grenache (optional)
                     ↓
              Direct TCP Connections Established
```

## 🔍 Project Structure

```
src/
├── index.js                     # Main entry point
├── clients/
│   ├── exchange-client.js       # Main exchange interface (hybrid P2P)
│   └── example-client.js        # Demo client implementation
├── core/
│   └── orderbook.js            # Order matching engine
├── p2p/                         # ⭐ New: True P2P components
│   ├── peer-protocol.js         # P2P message protocol
│   ├── peer-manager.js          # Peer connection management
│   ├── peer-storage.js          # Peer persistence
│   ├── direct-connection-service.js  # TCP server/client
│   ├── peer-discovery.js        # Multi-strategy discovery
│   ├── message-router.js        # Intelligent message routing
│   └── index.js                 # P2P module exports
├── services/
│   └── grenache-service.js     # Grenache (now optional!)
└── utils/                       # Supporting utilities
    ├── config.js                # Configuration (incl. P2P)
    ├── logger.js
    ├── vector-clock.js
    └── ...
```

## JSDoc Documentation

The project includes comprehensive JSDoc documentation for all classes and methods.

#### Generate Documentation

```bash
# Generate JSDoc documentation
npm run docs
```

This will create documentation in the `docs/` directory. Open `docs/index.html` in your browser to view the complete API documentation.
