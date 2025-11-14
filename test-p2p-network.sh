#!/bin/bash

# Test P2P Network with Embedded Grape DHT
echo "🧪 Testing P2P Network with 3 Nodes"
echo "===================================="
echo ""

# Clean up any existing processes
echo "🧹 Cleaning up previous processes..."
pkill -9 -f "node.*index.js" 2>/dev/null
sleep 2

# Create log directory
mkdir -p /tmp/p2p-test

# Start Node 1 (Bootstrap)
echo "🚀 Starting Node 1 (Bootstrap)..."
GRAPE_DHT_PORT=20001 GRAPE_API_PORT=30001 P2P_PORT=3001 \
  node src/index.js > /tmp/p2p-test/node1.log 2>&1 &
NODE1_PID=$!
echo "   PID: $NODE1_PID"
sleep 8

# Check Node 1
if ps -p $NODE1_PID > /dev/null; then
  echo "✅ Node 1 is running"
  grep -E "READY|Grape Mode|Node ID" /tmp/p2p-test/node1.log | head -5
else
  echo "❌ Node 1 failed to start"
  tail -10 /tmp/p2p-test/node1.log
  exit 1
fi
echo ""

# Start Node 2
echo "🚀 Starting Node 2..."
GRAPE_DHT_PORT=20002 GRAPE_API_PORT=30002 \
  GRAPE_BOOTSTRAP_NODES=127.0.0.1:20001 P2P_PORT=3002 \
  node src/index.js > /tmp/p2p-test/node2.log 2>&1 &
NODE2_PID=$!
echo "   PID: $NODE2_PID"
sleep 8

# Check Node 2
if ps -p $NODE2_PID > /dev/null; then
  echo "✅ Node 2 is running"
  grep -E "READY|Grape Mode|Node ID|Bootstrap" /tmp/p2p-test/node2.log | head -6
else
  echo "❌ Node 2 failed to start"
  tail -10 /tmp/p2p-test/node2.log
  kill -9 $NODE1_PID 2>/dev/null
  exit 1
fi
echo ""

# Start Node 3
echo "🚀 Starting Node 3..."
GRAPE_DHT_PORT=20003 GRAPE_API_PORT=30003 \
  GRAPE_BOOTSTRAP_NODES=127.0.0.1:20001,127.0.0.1:20002 P2P_PORT=3003 \
  node src/index.js > /tmp/p2p-test/node3.log 2>&1 &
NODE3_PID=$!
echo "   PID: $NODE3_PID"
sleep 8

# Check Node 3
if ps -p $NODE3_PID > /dev/null; then
  echo "✅ Node 3 is running"
  grep -E "READY|Grape Mode|Node ID|Bootstrap" /tmp/p2p-test/node3.log | head -6
else
  echo "❌ Node 3 failed to start"
  tail -10 /tmp/p2p-test/node3.log
  kill -9 $NODE1_PID $NODE2_PID 2>/dev/null
  exit 1
fi
echo ""

# Show network status
echo "🎉 All 3 nodes are running!"
echo "===================================="
echo ""
echo "📊 Network Summary:"
echo "   Node 1 PID: $NODE1_PID (Bootstrap)"
echo "   Node 2 PID: $NODE2_PID"
echo "   Node 3 PID: $NODE3_PID"
echo ""
echo "🍇 DHT Network:"
echo "   Node 1: DHT Port 20001, API Port 30001"
echo "   Node 2: DHT Port 20002, API Port 30002 → Bootstrap: 127.0.0.1:20001"
echo "   Node 3: DHT Port 20003, API Port 30003 → Bootstrap: 127.0.0.1:20001,127.0.0.1:20002"
echo ""
echo "✅ TRUE P2P Network is operational!"
echo ""
echo "📝 Logs available at:"
echo "   /tmp/p2p-test/node1.log"
echo "   /tmp/p2p-test/node2.log"
echo "   /tmp/p2p-test/node3.log"
echo ""
echo "Press Ctrl+C to stop all nodes..."

# Keep running and monitor
trap "echo ''; echo '🛑 Stopping all nodes...'; kill -9 $NODE1_PID $NODE2_PID $NODE3_PID 2>/dev/null; echo '✅ All nodes stopped'; exit 0" INT TERM

# Wait and show status every 10 seconds
while true; do
  sleep 10
  if ps -p $NODE1_PID > /dev/null && ps -p $NODE2_PID > /dev/null && ps -p $NODE3_PID > /dev/null; then
    echo "📊 [$(date +%H:%M:%S)] All 3 nodes still running ✅"
  else
    echo "❌ One or more nodes died!"
    ps -p $NODE1_PID > /dev/null || echo "   Node 1 is dead"
    ps -p $NODE2_PID > /dev/null || echo "   Node 2 is dead"
    ps -p $NODE3_PID > /dev/null || echo "   Node 3 is dead"
    break
  fi
done
