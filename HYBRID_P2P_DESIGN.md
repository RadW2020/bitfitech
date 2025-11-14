# Hybrid P2P Architecture Design

## Overview

This document describes the architectural changes to make the exchange truly peer-to-peer while keeping Grenache as an optional accelerator.

## Current Problems

1. **Hard dependency on Grape servers** - Nodes cannot function without external infrastructure
2. **Centralized peer discovery** - All discovery goes through Grape DHT
3. **Single point of failure** - If Grape servers fail, the network dies
4. **Not truly P2P** - Hub-and-spoke architecture masquerading as P2P

## New Architecture Goals

1. ✅ Nodes can function **completely standalone** without any external infrastructure
2. ✅ **Direct TCP connections** between peers for true P2P communication
3. ✅ Grenache is **optional** and only used as discovery accelerator when available
4. ✅ **Multiple discovery methods** with automatic fallback
5. ✅ **Peer exchange protocol** - peers share peer lists with each other
6. ✅ **Persistent peer list** - remember peers across restarts
7. ✅ **No single point of failure** - fully decentralized operation

---

## Architecture Components

### 1. **PeerManager** (`src/p2p/peer-manager.js`)

Manages the state of all connected peers.

**Responsibilities:**
- Maintain list of active peer connections
- Track peer metadata (nodeId, address, port, capabilities)
- Health monitoring and heartbeat checks
- Automatic reconnection to disconnected peers
- Peer scoring/reputation (optional)

**Key Methods:**
```javascript
class PeerManager {
  addPeer(peer)              // Add a new peer connection
  removePeer(peerId)         // Remove a peer
  getPeer(peerId)            // Get specific peer
  getAllPeers()              // Get all active peers
  getHealthyPeers()          // Get only healthy/responsive peers
  persistPeers()             // Save peer list to disk
  loadPersistedPeers()       // Load peers from disk
}
```

**Peer Data Structure:**
```javascript
{
  nodeId: "unique-node-id",
  address: "192.168.1.100",
  port: 3000,
  connection: <TCP Socket>,
  status: "connected" | "connecting" | "disconnected",
  lastSeen: Date,
  lastHeartbeat: Date,
  capabilities: {
    version: "1.0.0",
    supportedProtocols: ["order", "trade", "peerexchange"]
  },
  stats: {
    messagesReceived: 0,
    messagesSent: 0,
    bytesReceived: 0,
    bytesSent: 0
  }
}
```

---

### 2. **DirectConnectionService** (`src/p2p/direct-connection-service.js`)

Handles direct TCP connections between peers.

**Responsibilities:**
- Run TCP server to accept incoming peer connections
- Initiate outgoing connections to peers
- Protocol handshake and authentication
- Message framing and parsing
- Connection lifecycle management

**Key Features:**
- **Bidirectional communication** - Both client and server
- **Message framing** - Length-prefixed JSON messages
- **Handshake protocol** - Exchange nodeId, version, capabilities
- **Keepalive/Heartbeat** - Detect dead connections
- **Backpressure handling** - Flow control for busy peers

**Protocol:**
```
Connection Flow:
1. TCP connection established
2. Handshake: Both sides send { type: 'handshake', nodeId, version, port, capabilities }
3. Handshake ACK: Both sides respond { type: 'handshake_ack' }
4. Ready for messages
5. Periodic heartbeat: { type: 'heartbeat', timestamp }
6. Application messages: { type: 'order' | 'trade' | 'peerexchange', ... }
```

**Message Format:**
```javascript
// Frame: [4 bytes length][JSON payload]
{
  type: "order" | "trade" | "heartbeat" | "handshake" | "peerexchange",
  from: "sender-node-id",
  to: "recipient-node-id" | "*", // * for broadcast
  timestamp: 1699999999999,
  payload: { ... }
}
```

---

### 3. **PeerDiscovery** (`src/p2p/peer-discovery.js`)

Multi-strategy peer discovery system.

**Discovery Strategies:**

#### **a) Grenache Discovery (Optional)**
- Use Grenache DHT if available
- Fallback gracefully if Grenache unavailable
- Acts as "discovery accelerator"

#### **b) mDNS Discovery (Local Network)**
- Broadcast presence on local network
- Discover peers on same LAN/WiFi
- Zero configuration for local testing
- Uses multicast DNS (like AirDrop, Chromecast)

#### **c) Manual Peer Configuration**
- Connect to hardcoded/configured peer addresses
- Useful for bootstrap nodes or known peers
- Environment variable: `BOOTSTRAP_PEERS=192.168.1.100:3000,192.168.1.101:3000`

#### **d) Peer Exchange Protocol**
- Connected peers share their peer lists
- Exponential peer discovery
- Similar to BitTorrent PEX

#### **e) Persisted Peers**
- Load previously successful peers from disk
- Automatic reconnection on startup
- File: `.peers.json`

**Discovery Priority:**
```
1. Try persisted peers (fastest)
2. Try manual/bootstrap peers (configured)
3. Try mDNS (local network)
4. Try Grenache (if available)
5. Wait for peer exchange from connected peers
```

**Key Methods:**
```javascript
class PeerDiscovery {
  async discover()                    // Run all discovery strategies
  async discoverViaGrenache()         // Optional Grenache discovery
  async discoverViaMDNS()             // Local network discovery
  async discoverViaBootstrap()        // Manual peer list
  async discoverViaPeerExchange()     // Ask peers for more peers
  async loadPersistedPeers()          // Load from disk
}
```

---

### 4. **MessageRouter** (`src/p2p/message-router.js`)

Intelligent message routing with fallback strategies.

**Routing Logic:**
```
1. Try direct connection (if peer connected)
2. Try Grenache (if available and peer announced)
3. Queue message for later delivery
4. Return error if all methods fail
```

**Broadcast Strategy:**
```
For broadcast messages (orders, trades):
1. Send to all directly connected peers (primary)
2. Send via Grenache if available (backup)
3. Dedup received messages by hash
```

**Key Methods:**
```javascript
class MessageRouter {
  async sendToPeer(peerId, message)     // Send to specific peer
  async broadcast(message)              // Send to all peers
  async route(message)                  // Intelligent routing
}
```

---

### 5. **PeerProtocol** (`src/p2p/peer-protocol.js`)

Defines the peer-to-peer communication protocol.

**Message Types:**

```javascript
// Handshake
{
  type: 'handshake',
  nodeId: 'node-123',
  version: '1.0.0',
  port: 3000,
  capabilities: ['order', 'trade', 'peerexchange']
}

// Heartbeat
{
  type: 'heartbeat',
  timestamp: 1699999999999
}

// Peer Exchange
{
  type: 'peerexchange',
  peers: [
    { nodeId: 'node-456', address: '192.168.1.100', port: 3000 },
    { nodeId: 'node-789', address: '192.168.1.101', port: 3001 }
  ]
}

// Order
{
  type: 'order',
  order: { ... }
}

// Trade
{
  type: 'trade',
  trade: { ... }
}
```

---

### 6. **Modified ExchangeClient**

Integration of hybrid P2P system.

**Changes:**
```javascript
class ExchangeClient {
  #peerManager
  #directConnectionService
  #peerDiscovery
  #messageRouter
  #grenacheService  // Optional now!

  async initialize() {
    // 1. Start direct connection service (always)
    await this.#directConnectionService.start();

    // 2. Try to initialize Grenache (optional)
    try {
      await this.#grenacheService.initialize();
      this.#hasGrenache = true;
    } catch (err) {
      logger.warn('Grenache not available, running in pure P2P mode');
      this.#hasGrenache = false;
    }

    // 3. Discover peers using all strategies
    await this.#peerDiscovery.discover();
  }

  async submitOrder(order) {
    // Match locally first
    const trades = this.#orderbook.matchOrder(order);

    // Broadcast via hybrid router
    await this.#messageRouter.broadcast({
      type: 'order',
      order: order
    });
  }
}
```

---

## File Structure

```
src/
├── p2p/
│   ├── peer-manager.js              # Manages peer connections
│   ├── direct-connection-service.js # TCP server/client
│   ├── peer-discovery.js            # Multi-strategy discovery
│   ├── message-router.js            # Intelligent message routing
│   ├── peer-protocol.js             # Protocol definitions
│   └── peer-storage.js              # Persist peers to disk
├── clients/
│   └── exchange-client.js           # Modified to use hybrid P2P
├── services/
│   └── grenache-service.js          # Now optional!
└── core/
    └── orderbook.js                 # No changes needed
```

---

## Configuration

### New Environment Variables

```bash
# Direct P2P Configuration
P2P_ENABLED=true                     # Enable direct P2P (default: true)
P2P_PORT=3000                        # TCP port for peer connections
P2P_HOST=0.0.0.0                     # Bind address

# Discovery Configuration
DISCOVERY_MDNS=true                  # Enable mDNS discovery (default: true)
DISCOVERY_GRENACHE=true              # Enable Grenache discovery (default: true)
BOOTSTRAP_PEERS=                     # Comma-separated peer addresses

# Peer Management
PEER_STORAGE_PATH=.peers.json        # Where to save peer list
MAX_PEERS=50                         # Maximum peer connections
PEER_RECONNECT_INTERVAL=30000        # Reconnect interval (ms)

# Grenache (Optional)
GRAPE_URL=http://127.0.0.1:30001     # Grenache URL (optional now!)
```

---

## Operating Modes

### **Mode 1: Pure P2P (No Grenache)**

```bash
P2P_ENABLED=true
DISCOVERY_GRENACHE=false
BOOTSTRAP_PEERS=192.168.1.100:3000
```

- No dependency on Grape servers
- Relies on direct connections only
- Uses mDNS + bootstrap + peer exchange

### **Mode 2: Hybrid (Grenache + P2P)**

```bash
P2P_ENABLED=true
DISCOVERY_GRENACHE=true
GRAPE_URL=http://127.0.0.1:30001
```

- Uses Grenache for fast discovery
- Also maintains direct connections
- Best of both worlds

### **Mode 3: Legacy (Grenache Only)**

```bash
P2P_ENABLED=false
DISCOVERY_GRENACHE=true
```

- Backwards compatible
- Original behavior preserved

---

## Migration Path

### Phase 1: Implement Core P2P
1. Implement PeerManager
2. Implement DirectConnectionService
3. Basic peer-to-peer communication working

### Phase 2: Multi-Strategy Discovery
4. Implement PeerDiscovery
5. Add mDNS support
6. Add peer persistence

### Phase 3: Integration
7. Implement MessageRouter
8. Modify ExchangeClient
9. Make Grenache optional

### Phase 4: Advanced Features
10. Peer exchange protocol
11. Peer reputation/scoring
12. NAT traversal (future)

---

## Testing Strategy

### Unit Tests
- PeerManager connection handling
- Message framing/parsing
- Discovery strategies individually

### Integration Tests
- **Pure P2P mode**: 3 nodes without Grenache
- **Hybrid mode**: 3 nodes with Grenache available
- **Failover**: Start with Grenache, then kill it
- **Peer exchange**: Verify peers discover each other

### Network Tests
- **Local network**: Multiple nodes on LAN
- **Internet**: Nodes across different networks (NAT)
- **Partitioning**: Network splits and heals

---

## Benefits

### ✅ True P2P
- No centralized infrastructure required
- Nodes can operate independently
- No single point of failure

### ✅ Resilient
- Multiple discovery methods
- Automatic failover
- Peer reconnection

### ✅ Backwards Compatible
- Existing Grenache infrastructure still works
- Gradual migration possible
- Legacy mode supported

### ✅ Flexible
- Works on LAN without configuration (mDNS)
- Works on internet with bootstrap peers
- Works with Grenache for fast discovery

---

## Future Enhancements

### NAT Traversal
- STUN/TURN servers for NAT hole punching
- UPnP port mapping
- Relay nodes for unreachable peers

### WebRTC
- Browser-based nodes
- Direct peer connections through firewalls
- Media streaming for future features

### DHT Implementation
- Full Kademlia DHT embedded in each node
- Replace Grenache completely
- Better scalability

### Encryption
- TLS/SSL for peer connections
- End-to-end message encryption
- Peer authentication

---

## Implementation Estimate

- **Phase 1 (Core P2P)**: ~2-3 hours
- **Phase 2 (Discovery)**: ~2-3 hours
- **Phase 3 (Integration)**: ~1-2 hours
- **Phase 4 (Advanced)**: ~2-3 hours
- **Testing & Documentation**: ~2 hours

**Total**: ~10-13 hours of development

---

## Questions for Review

1. Should we implement all discovery strategies or start with a subset?
2. Should peer persistence be encrypted?
3. Do we need peer authentication/authorization?
4. Should we implement NAT traversal in this phase or later?
5. What's the target number of max peer connections (50? 100?)?

---

## Next Steps

Once approved, implementation order:
1. Create `src/p2p/` directory structure
2. Implement PeerManager (core state management)
3. Implement DirectConnectionService (TCP layer)
4. Implement basic protocol (handshake + messages)
5. Integrate with ExchangeClient
6. Make Grenache optional
7. Add discovery strategies incrementally
8. Tests and documentation
