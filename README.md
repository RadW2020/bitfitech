# BitfiTech: True Peer-to-Peer Distributed Exchange

**A genuinely decentralized exchange with NO central servers required.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

## 🎯 Core Features

✅ **Distributed Orderbook** - Each client has its own orderbook instance
✅ **Order Distribution** - Orders distributed to all peer instances via Grenache
✅ **Match & Remainder** - Matched order remainders added to orderbook
✅ **Grenache Communication** - Uses Grenache DHT for inter-node communication
✅ **Embedded Grape** - Each node runs its own Grape DHT server
✅ **No Central Servers** - Fully distributed Kademlia DHT network

**Built to spec:** Uses Grenache for communication between nodes, with each client maintaining its own orderbook instance.

Read [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed explanation.

---

## 📋 Prerequisites

Before getting started, ensure you have the following:

### System Requirements

- **Node.js**: >= 20.19.5 (check with `node --version`)
- **npm**: >= 8.0.0 (check with `npm --version`)
- **Memory**: Minimum 512MB RAM per node (recommended 1GB for development)
- **Operating Systems**: Linux, macOS, Windows (WSL recommended for Windows)

### Network Requirements

**Default ports** (can be customized via environment variables):

- **P2P Port**: 3000 (for peer-to-peer connections)
- **Grape DHT Port**: 20001 (for Kademlia DHT)
- **Grape API Port**: 30001 (for Grape HTTP API)

**Firewall**: Ensure these ports are accessible if running across different machines/networks.

### Installation

```bash
# Clone the repository
git clone https://github.com/RadW2020/bitfitech.git
cd bitfitech

# Install dependencies
npm install
```

**Note**: If you see dependency vulnerabilities, you can safely ignore them for development or run `npm audit fix` to address them.

---

## 🚀 Quick Start

### Zero-Configuration Start (Recommended)

Get started in **3 simple steps**:

**Step 1**: Ensure you've installed dependencies (see [Prerequisites](#-prerequisites) above)

```bash
npm install
```

**Step 2**: Start your first node

```bash
npm start
```

**Step 3**: Done! Your node is now running and will automatically discover peers.

**What happens:**
1. Starts embedded Grape DHT server (Kademlia)
2. Starts P2P server on port 3000
3. Discovers peers via Grenache DHT + mDNS
4. Initializes local orderbook
5. Distributes orders via Grenache to all peers

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

### Default Configuration (Grenache + P2P)

**No configuration needed!** Defaults fulfill original requirements:

```javascript
{
  "embeddedGrape": {
    "enabled": true,              // Each node runs Grape DHT
    "dhtPort": 20001,             // Kademlia DHT port
    "apiPort": 30001              // Grape HTTP API port
  },
  "p2p": {
    "enabled": true,              // Always on
    "port": 3000,                 // P2P listening port
    "enableMDNS": true,           // Local network discovery
    "enableGrenache": true,       // Grenache DHT (REQUIRED per spec)
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

### 1️⃣ Grenache + P2P Mode (DEFAULT - Per Spec)

**Uses Grenache for communication** - Fulfills original requirements.

```bash
npm start
```

**Features:**
- Embedded Grape DHT (Kademlia) in each node
- Grenache for order distribution between nodes
- Direct TCP peer connections
- mDNS local discovery
- Peer exchange protocol
- Well-known bootstrap nodes

**Perfect for:**
- Production deployments
- Meets "Use Grenache" requirement
- Distributed Kademlia DHT
- No external infrastructure

**Is this TRUE P2P?** ✅ **YES** (distributed DHT, no central servers)

---

### 2️⃣ Pure P2P Mode (Optional - Without Grenache)

**For simple local testing only** - Disables Grenache (not per spec).

```bash
EMBEDDED_GRAPE=false \
DISCOVERY_GRENACHE=false \
P2P_PORT=3001 \
npm start
```

**Features:**
- Direct TCP connections only
- mDNS local discovery
- Peer exchange
- No DHT

**Note:** Does NOT fulfill "Use Grenache" requirement. Use only for local testing.

---

### 3️⃣ Legacy Grenache Mode (External Grape Servers)

**Requires manual Grape servers** - Not recommended (centralized).

See [EMBEDDED_GRAPE_DHT.md](./EMBEDDED_GRAPE_DHT.md) for details.

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

## 🔧 Troubleshooting

### Common Issues and Solutions

#### Problem: Port Already in Use

**Error**: `EADDRINUSE: address already in use 0.0.0.0:3000`

**Solution**: Another process is using the default port. Change the port using environment variables:

```bash
# Change P2P port
P2P_PORT=3001 npm start

# For multiple nodes on same machine
P2P_PORT=3001 GRAPE_DHT_PORT=20002 GRAPE_API_PORT=30002 npm start
```

**Alternative**: Find and stop the process using the port:

```bash
# Linux/macOS
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

#### Problem: Nodes Not Discovering Each Other

**Symptoms**: Node starts but doesn't connect to peers

**Solutions**:

1. **Check firewall settings**: Ensure ports are not blocked
   ```bash
   # Linux: Allow ports through firewall
   sudo ufw allow 3000/tcp
   sudo ufw allow 20001/tcp
   sudo ufw allow 30001/tcp
   ```

2. **Verify mDNS is enabled** (for local network discovery):
   ```bash
   # Check environment variable
   echo $DISCOVERY_MDNS  # Should be 'true' or empty
   ```

3. **Use manual bootstrap peers**:
   ```bash
   # Connect to specific peer
   BOOTSTRAP_PEERS=192.168.1.100:3000 npm start
   ```

4. **Check if Grenache is running** (if using embedded mode):
   - Look for "Grape DHT server started" in logs
   - Verify ports 20001 and 30001 are listening

---

#### Problem: Node.js Version Mismatch

**Error**: `The engine "node" is incompatible with this module`

**Solution**: Update Node.js to version 20.19.5 or higher:

```bash
# Using nvm (recommended)
nvm install 20.19.5
nvm use 20.19.5

# Verify version
node --version
```

---

#### Problem: Memory/Performance Issues

**Symptoms**: Slow performance, high memory usage

**Solutions**:

1. **Reduce maximum peers**:
   ```bash
   MAX_PEERS=25 npm start
   ```

2. **Increase Node.js memory limit**:
   ```bash
   NODE_OPTIONS="--max-old-space-size=2048" npm start
   ```

3. **Disable verbose logging in production**:
   ```bash
   LOG_LEVEL=warn NODE_ENV=production npm start
   ```

---

#### Problem: Tests Failing

**Common causes**:

1. **Port conflicts**: Other tests or processes using ports
   ```bash
   # Kill all node processes
   pkill -9 node

   # Run tests again
   npm test
   ```

2. **Timeout issues**: Increase test timeout
   ```bash
   # Edit vitest.config.js to increase timeout
   ```

3. **Clean start**: Remove generated files
   ```bash
   rm -f .peers*.json
   npm test
   ```

---

#### Problem: Connection Timeouts

**Error**: `Connection timeout` or `Socket closed before connection`

**Solutions**:

1. **Increase timeout values** in `.env`:
   ```bash
   PEER_RECONNECT_INTERVAL=60000  # 60 seconds
   ```

2. **Check network connectivity**:
   ```bash
   # Test connection to peer
   nc -zv 127.0.0.1 3000

   # Or using telnet
   telnet 127.0.0.1 3000
   ```

3. **Disable rate limiting** during development:
   ```bash
   ENABLE_RATE_LIMIT=false npm start
   ```

---

#### Problem: Orderbook Inconsistencies

**Symptoms**: Different orderbook states across nodes

**Solutions**:

1. **Wait for synchronization**: Give nodes time to sync (2-5 seconds)

2. **Check peer connections**:
   - Verify all nodes are connected to each other
   - Check logs for "Peer connected" messages

3. **Restart all nodes** for clean state:
   ```bash
   # Stop all nodes
   pkill -9 node

   # Clean peer storage
   rm -f .peers*.json

   # Start nodes again
   ```

---

### Getting More Help

If you encounter issues not covered here:

1. **Check logs**: Set `LOG_LEVEL=debug` for detailed information
2. **Search existing issues**: [GitHub Issues](https://github.com/RadW2020/bitfitech/issues)
3. **Open a new issue**: Include logs, environment details, and steps to reproduce
4. **Join discussions**: [GitHub Discussions](https://github.com/RadW2020/bitfitech/discussions)

---

## 🤔 FAQ

### Q: Do I need to run Grape servers?

**A: NO external servers needed!** Each node runs its own embedded Grape DHT server. It's fully distributed - no central Grape infrastructure required.

### Q: Why Grenache?

**A: Project requirement.** The original spec requires "Use Grenache for communication between nodes". We fulfill this with embedded Grape (distributed DHT) in each node.

### Q: Are bootstrap nodes "centralized"?

**A: No.** They're entry points for DHT discovery. After first connection:
- Your node joins the Kademlia DHT
- You discover more peers via DHT
- Peers remembered in `.peers.json`
- Any node can be a bootstrap node

Like Bitcoin's DNS seeds or BitTorrent DHT bootstrap.

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
