# P2P Distributed Exchange - Architecture Documentation

## 🎯 Overview

This project implements a **true P2P distributed exchange** using Grenache DHT for peer-to-peer communication. Each node maintains its own orderbook and communicates directly with other nodes without any central server.

## 🏗️ Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Node A        │    │   Node B        │    │   Node C        │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ OrderBook   │ │    │ │ OrderBook   │ │    │ │ OrderBook   │ │
│ │ (Local)     │ │    │ │ (Local)     │ │    │ │ (Local)     │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Grenache    │◄┼────┼►│ Grenache    │◄┼────┼►│ Grenache    │ │
│ │ P2P Layer   │ │    │ │ P2P Layer   │ │    │ │ P2P Layer   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────┐
                    │   Grenache DHT      │
                    │  (Grape Network)    │
                    │  - Peer Discovery   │
                    │  - Service Registry │
                    │  - No Central Server│
                    └─────────────────────┘
```

## 🔍 P2P Architecture Evidence

### 1. **No Central Server**

- ❌ No single point of failure
- ❌ No central orderbook
- ❌ No central matching engine
- ✅ Each node is independent
- ✅ Direct peer-to-peer communication

### 2. **Distributed Components**

#### **Local Orderbooks**

- Each node maintains its own independent orderbook
- No shared state between nodes
- Local matching engine per node

#### **P2P Communication**

- Direct peer-to-peer communication via Grenache
- No central server or coordinator
- Nodes discover each other through DHT

#### **Vector Clocks for Ordering**

- Distributed event ordering across nodes
- Ensures causal consistency
- Prevents race conditions in distributed environment

## 🚀 How to Run the P2P Demo

### 1. **Start Grenache DHT Network**

```bash
# Terminal 1 - Grape 1 (Debug mode)
DEBUG="*" grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'

# Terminal 2 - Grape 2 (Debug mode)
DEBUG="*" grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'
```

### 2. **Start P2P Exchange Nodes**

```bash
# Terminal 3 - P2P Node 1 (normal node, no auto demo)
npm start

# Terminal 4 - P2P Node 2 (normal node, no auto demo)
npm start

# Terminal 5 - P2P Node 3 (with automatic demo for testing)
npm run start:client node1

# Terminal 6 - P2P Node 4 (with automatic demo for testing)
npm run start:client node2
```

### 3. **What Happens in Each Terminal**

#### \*_Terminal 1 & 2 - Grenache DHT Network_

- **Terminal 1**: Grape server 1 announces itself and discovers other grape servers
- **Terminal 2**: Grape server 2 announces itself and discovers other grape servers
- **Both**: Create the distributed hash table (DHT) for peer discovery
- **Logs**: You'll see peer discovery messages and service announcements

#### **Terminal 3 - P2P Node 1 (Normal)**

- Starts a P2P exchange node
- Connects to the Grenache DHT network
- Waits for other nodes to connect
- **Logs**: Node initialization, connection to DHT, status updates every 30 seconds

#### **Terminal 4 - P2P Node 2 (Normal)**

- Starts another P2P exchange node
- Connects to the same Grenache DHT network
- Discovers Node 1 through the DHT
- **Logs**: Node initialization, peer discovery, connection to other nodes

#### **Terminal 5 - P2P Node 3 (Demo)**

- Starts a P2P exchange node with automatic demo
- Connects to the DHT and discovers other nodes
- **Automatically places orders**: Random buy and sell orders at different prices
- **Logs**: Order placement, distribution to other nodes, trade execution

#### **Terminal 6 - P2P Node 4 (Demo)**

- Starts another P2P exchange node with automatic demo
- Connects to the DHT and discovers other nodes
- **Automatically places orders**: Random buy and sell orders at different prices
- **Logs**: Order placement, distribution to other nodes, trade execution

### 4. **What You Should See**

#### **P2P Communication Evidence**

- **Peer Discovery**: Nodes finding each other through the DHT
- **Order Distribution**: Orders from one node appearing in others
- **Trade Execution**: Trades being executed between nodes
- **Orderbook Sync**: All nodes maintaining the same orderbook state

#### **Example Logs**

```
# Peer Discovery
grenache:grape 20001 found potential peer 127.0.0.1:1136 through 127.0.0.1:20002 for hash: p2p_exchange
grenache:grape 20001 found potential peer 127.0.0.1:1180 through 127.0.0.1:20002 for hash: p2p_exchange

# Order Distribution
📨 Received order from node 386dc5f0-9a76-4569-8efc-4388e286782d: 42b238e9-ed3b-4b2c-8f59-390f2cc366e2
📨 Processing order from other node: 42b238e9-ed3b-4b2c-8f59-390f2cc366e2
✅ Processed order 42b238e9-ed3b-4b2c-8f59-390f2cc366e2 with 0 trades

# Trade Distribution
💰 Received trade from node 386dc5f0-9a76-4569-8efc-4388e286782d: f77f3e78-5d22-40cd-b08b-9051c2bfb18b
💰 Received trade from other node: f77f3e78-5d22-40cd-b08b-9051c2bfb18b

# Trade Execution
✅ Processed order a2009a86-35c3-4007-8713-a68026a2840e with 2 trades
✅ Processed order a2009a86-35c3-4007-8713-a68026a2840e with 3 trades

# Order Distribution Success
📡 Order distributed to 1 nodes
distribution: { success: true, distributedTo: [ 'unknown' ], failedTo: [] }
```
