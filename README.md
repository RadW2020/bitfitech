# BitfiTech: True Peer-to-Peer Distributed Exchange

**A genuinely decentralized exchange with NO central servers required.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

## 🎯 What Makes This TRUE P2P?

✅ **No Central Servers** - Each node runs independently
✅ **Direct TCP Connections** - Peers communicate directly
✅ **Decentralized Discovery** - Find peers without central registry
✅ **Self-Organizing Network** - No coordinator needed
✅ **Distributed Orderbook** - Full replication across nodes
✅ **Censorship Resistant** - No single point of failure

**This is REAL peer-to-peer.** Like BitTorrent. Like Bitcoin. **No central infrastructure.**

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed explanation.

---

## 🚀 Quick Start

### Zero-Configuration Start (Recommended)

Just run it. No servers, no config, no hassle:

```bash
# Install dependencies
npm install

# Start node (uses well-known bootstrap nodes automatically)
npm start
```

**That's it!** Your node will:
1. Start P2P server on port 3000
2. Discover peers via mDNS (local network)
3. Connect to well-known bootstrap nodes
4. Join the distributed network
5. Replicate orderbook from peers

### Multi-Node Local Network

Test with multiple nodes on your machine:

```bash
# Terminal 1 - First node (becomes bootstrap for others)
P2P_PORT=3001 npm start

# Terminal 2 - Second node
P2P_PORT=3002 npm start

# Terminal 3 - Third node
P2P_PORT=3003 npm start
```

**What happens:**
- Nodes discover each other via mDNS
- Direct TCP connections established
- Orderbook synchronized automatically
- Orders propagate peer-to-peer

---

## 📚 Configuration

### Default Configuration (Pure P2P)

**No configuration needed!** Defaults are optimized for true P2P:

```javascript
{
  "p2p": {
    "enabled": true,              // Always on
    "port": 3000,                 // P2P listening port
    "enableMDNS": true,           // Local network discovery
    "enableGrenache": false,      // DHT disabled (pure P2P)
    "enablePeerExchange": true,   // Peers share peer lists
    "useWellKnownNodes": true     // Use community bootstrap nodes
  }
}
```

### Environment Variables

Customize if needed:

```bash
# P2P Network
P2P_PORT=3000                      # P2P listening port
P2P_HOST=0.0.0.0                   # Bind address (0.0.0.0 = all interfaces)

# Discovery (all optional)
DISCOVERY_MDNS=true                # Local network discovery
DISCOVERY_PEER_EXCHANGE=true       # Peer list sharing
USE_WELL_KNOWN_NODES=true          # Use community bootstrap nodes

# Custom Bootstrap Peers
BOOTSTRAP_PEERS=peer1.com:3000,peer2.com:3000

# Peer Management
PEER_STORAGE_PATH=.peers.json      # Persistent peer storage
MAX_PEERS=50                       # Maximum connections

# Exchange
EXCHANGE_PAIR=BTC/USD              # Trading pair
```

---

## 🌐 Operating Modes

### 1️⃣ Pure P2P Mode (DEFAULT - Recommended)

**TRUE PEER-TO-PEER** - No DHT, no servers, just peers.

```bash
npm start
```

**Features:**
- Direct TCP peer connections
- mDNS local discovery
- Well-known bootstrap nodes
- Peer exchange protocol
- Persistent peer storage

**Perfect for:**
- Maximum decentralization
- Local/regional networks
- Privacy-focused deployments
- Simple setup

**Is this TRUE P2P?** ✅ **YES**

---

### 2️⃣ P2P + DHT Mode (Optional)

**For large-scale networks** - Add Kademlia DHT for faster peer discovery.

```bash
EMBEDDED_GRAPE=true \
GRAPE_DHT_PORT=20001 \
GRAPE_API_PORT=30001 \
GRAPE_BOOTSTRAP_NODES=dht1.example.com:20001 \
npm start
```

**Additional Features:**
- Embedded Kademlia DHT (each node runs own DHT server)
- Distributed hash table
- Faster peer discovery
- Better for global networks

**Perfect for:**
- Large networks (100+ nodes)
- Global deployments
- Faster peer discovery

**Is this TRUE P2P?** ✅ **YES** (each node runs own DHT)

---

### 3️⃣ Legacy Grenache Mode (NOT Recommended)

**DO NOT USE** unless you need legacy compatibility.

Requires external Grape servers (centralized).

---

## 🔍 How It Works

### 1. Node Startup

```
┌────────────────────────────────────┐
│  Start P2P Node                    │
│  1. Load persisted peers           │
│  2. Start TCP server               │
│  3. Start discovery                │
└────────────────────────────────────┘
```

### 2. Peer Discovery

```
┌─────────────────┐
│ Discovery       │
│ Strategies:     │
│                 │
│ ✓ Persisted     │──► Reconnect to known peers
│ ✓ mDNS          │──► Find local network peers
│ ✓ Bootstrap     │──► Connect to well-known nodes
│ ✓ Peer Exchange │──► Get peers from peers
└─────────────────┘
```

### 3. Direct Connections

```
Node A ──TCP──► Node B
  │              │
  └──TCP──►──────┘
       Node C
```

### 4. Order Propagation

```
1. User places order on Node A
2. Node A adds to local orderbook
3. Node A broadcasts to connected peers
4. Peers receive, deduplicate, add to orderbook
5. Peers rebroadcast to their peers
6. Order reaches entire network
```

### 5. Trade Matching

```
Each node independently:
1. Receives orders from network
2. Matches against local orderbook
3. Broadcasts trade to network
4. Vector clocks ensure consistency
```

---

## 🛠️ Advanced Usage

### Custom Bootstrap Nodes

```bash
# Connect only to specific peers
BOOTSTRAP_PEERS=friend1.example.com:3000,friend2.example.com:3000 \
USE_WELL_KNOWN_NODES=false \
npm start
```

### Disable All Discovery (Manual Only)

```bash
# Only connect to specified peers
DISCOVERY_MDNS=false \
DISCOVERY_PEER_EXCHANGE=false \
USE_WELL_KNOWN_NODES=false \
BOOTSTRAP_PEERS=specific.peer.com:3000 \
npm start
```

### Production Deployment

```bash
# Recommended production settings
NODE_ENV=production \
P2P_PORT=3000 \
P2P_HOST=0.0.0.0 \
MAX_PEERS=100 \
LOG_LEVEL=info \
npm start
```

---

## 🧪 Testing

```bash
# Run test suite
npm test

# Run with coverage
npm run test:coverage

# Integration tests
npm run test:integration

# Pure P2P integration test
npm run test -- test/integration/pure-p2p.test.js
```

---

## 📊 Key Features

### Truly Decentralized
- **No central servers** - Each node is independent
- **No coordinator** - Self-organizing network
- **No single point of failure** - Network survives node failures

### Direct P2P Communication
- **TCP connections** - Direct socket-to-socket
- **Message routing** - Intelligent broadcast with deduplication
- **Gossip protocol** - Efficient message propagation

### Smart Discovery
- **mDNS** - Zero-config local network discovery
- **Bootstrap nodes** - Well-known entry points
- **Peer exchange** - Exponential peer discovery
- **Persistent peers** - Remember connections across restarts

### Financial Grade
- **Decimal precision** - Accurate financial calculations
- **Price-time priority** - Fair FIFO matching
- **Vector clocks** - Distributed event ordering
- **Circuit breaker** - Fault tolerance

### Production Ready
- **Comprehensive logging** - Structured logging system
- **Health monitoring** - Heartbeat and peer health
- **Rate limiting** - Protection against abuse
- **Error handling** - Graceful degradation

---

## 🏗️ Project Structure

```
src/
├── p2p/                           # 🔥 Core P2P Components
│   ├── direct-connection-service.js   # Direct TCP connections
│   ├── peer-manager.js                # Peer lifecycle management
│   ├── peer-discovery.js              # Multi-strategy discovery
│   ├── message-router.js              # Intelligent routing
│   ├── peer-protocol.js               # P2P message protocol
│   ├── peer-storage.js                # Persistent peer storage
│   └── well-known-nodes.js            # Bootstrap node registry
│
├── core/
│   └── orderbook.js               # Order matching engine
│
├── clients/
│   ├── exchange-client.js         # Main exchange interface
│   └── example-client.js          # Demo implementation
│
├── services/
│   ├── grenache-service.js        # Optional: DHT service
│   └── embedded-grape-server.js   # Optional: Embedded DHT
│
└── utils/
    ├── config.js                  # Configuration management
    ├── logger.js                  # Logging system
    ├── vector-clock.js            # Distributed ordering
    ├── circuit-breaker.js         # Fault tolerance
    └── ...
```

---

## 🔐 Security Considerations

### Network Security

✅ **Peer verification** - Handshake protocol
✅ **Message validation** - Schema validation
✅ **Rate limiting** - Prevent abuse
✅ **Circuit breaker** - Fault isolation
⚠️ **Encryption** - Planned (TLS)
⚠️ **Authentication** - Planned (signatures)

### Trust Model

This is a **permissionless network**:
- Any node can join
- Nodes maintain local orderbooks
- Consensus via vector clocks
- No Byzantine fault tolerance (yet)

**For production:** Consider adding:
- Message signing
- Peer whitelisting
- Network access control
- Byzantine fault tolerance

---

## 🤔 FAQ

### Q: Do I need to run Grape servers?

**A: NO!** By default, this uses pure P2P with no external dependencies.

### Q: Are bootstrap nodes "centralized"?

**A: No.** They're just entry points. After first connection:
- You remember peers in `.peers.json`
- You use peer exchange to find more peers
- You don't need bootstrap anymore
- Any node can be a bootstrap node

Like Bitcoin's DNS seeds - helpful but not required.

### Q: Can this work completely offline?

**A: On local network, YES!** mDNS discovery works without internet.

### Q: How do I become a bootstrap node?

**A: Just run a stable node!** Anyone can add your node to `src/p2p/well-known-nodes.js` via PR.

### Q: What if all bootstrap nodes are down?

**A: No problem!** You can:
1. Use mDNS (works on LAN)
2. Connect to any peer manually
3. Wait for persisted peers to come online

### Q: Is this like BitTorrent?

**A: YES!** Similar architecture:
- Direct peer connections
- Gossip protocol
- Optional DHT (Kademlia)
- Decentralized discovery

### Q: How many nodes can this scale to?

**A: Thousands.** Each node maintains ~50-100 connections. Network grows exponentially via peer exchange.

---

## 📖 Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Deep dive into P2P architecture
- [EMBEDDED_GRAPE_DHT.md](./EMBEDDED_GRAPE_DHT.md) - DHT mode documentation
- API Documentation - Run `npm run docs`

---

## 🤝 Contributing

We welcome contributions! Especially:

- Adding well-known bootstrap nodes
- Improving discovery algorithms
- Byzantine fault tolerance
- Message encryption
- Performance optimization

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## 🛣️ Roadmap

### Current State: Pure P2P ✅
- Direct TCP connections
- Decentralized discovery
- Distributed orderbook
- Production ready

### Planned Features
- [ ] TLS encryption for peer connections
- [ ] Message signing and verification
- [ ] Byzantine fault tolerance
- [ ] NAT traversal (UPnP/STUN/TURN)
- [ ] IPv6 support
- [ ] Performance metrics and monitoring
- [ ] Web UI for node management

---

## 📜 License

MIT License - See [LICENSE](./LICENSE) file

---

## 🎯 Core Philosophy

> **"True P2P means peers talk directly. No servers. No middlemen. No single point of failure."**

This system embodies that philosophy completely.

### What We Believe

- **Decentralization is not optional** - It's the core design principle
- **Simplicity over features** - Easy to run, hard to break
- **Community over corporation** - Anyone can contribute
- **Transparency over obscurity** - Open source, readable code

---

## 🙏 Acknowledgments

Inspired by:
- **BitTorrent** - Gossip protocol and peer exchange
- **Bitcoin** - Decentralized consensus and bootstrap nodes
- **Kademlia** - Distributed hash table design
- **Grenache** - DHT implementation (optional component)

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/RadW2020/bitfitech/issues)
- **Discussions**: [GitHub Discussions](https://github.com/RadW2020/bitfitech/discussions)
- **Email**: raul@bitfitech.network

---

**Built with ❤️ for a truly decentralized future.**

**No servers. No middlemen. Just peers.**
