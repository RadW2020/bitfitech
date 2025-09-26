#!/usr/bin/env node

/**
 * Simple grape cluster startup script
 */

import { spawn } from 'node:child_process';

console.log('🍇 Starting Grape DHT nodes in debug mode...');

// Primary grape node with debug
const grape1 = spawn('grape', ['--dp', '20001', '--aph', '30001', '--bn', '127.0.0.1:20002'], {
  stdio: 'inherit',
  env: { ...process.env, DEBUG: 'grenache:*' },
});

// Secondary grape node with debug
const grape2 = spawn('grape', ['--dp', '20002', '--aph', '40001', '--bn', '127.0.0.1:20001'], {
  stdio: 'inherit',
  env: { ...process.env, DEBUG: 'grenache:*' },
});

console.log('✅ Grape cluster running on ports 30001 and 40001');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down grapes...');
  grape1.kill();
  grape2.kill();
  process.exit(0);
});
