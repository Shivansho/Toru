import { io } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import Redis from 'ioredis';

const redisClient = new Redis();

const prisma = new PrismaClient();
const TARGET = 'http://localhost:3000';

const CONNECTIONS = 500;
const QUEUE_SIZE = 100;
const BURST_COUNT = 10;

async function run() {
  console.log(`Starting load test with ${CONNECTIONS} connections...`);
  
  // Seed a college
  const col = await prisma.college.create({
    data: { name: 'Load College', domains: [], studentPattern: '', staffPattern: '', programmeLengths: {}, retentionSettings: {}, status: 'ACTIVE' }
  });

  const sockets: any[] = [];
  const metrics = { connected: 0, matched: 0, messagesSent: 0, messagesReceived: 0, errors: 0, latencies: [] as number[] };

  const startMemory = process.memoryUsage().heapUsed;

  // Create users and connect
  for (let i = 0; i < CONNECTIONS; i++) {
    const user = await prisma.user.create({
      data: { 
        collegeId: col.id, 
        emailEncrypted: `LT${i}`, 
        emailHash: `lthash${i}`, 
        joiningYear: 2024, 
        branch: 'lt', 
        programme: 'lt', 
        status: 'ACTIVE',
        ageVerified: true
      }
    });

    // Add required consent to pass socket auth
    await prisma.consent.create({
      data: { userId: user.id, type: 'TERMS', version: '1.0' }
    });

    const sessionId = crypto.randomUUID();
    await redisClient.set(`session:${sessionId}`, user.id, 'EX', 3600);
    await redisClient.sadd(`user_sessions:${user.id}`, sessionId);

    const socket = io(TARGET, { 
      extraHeaders: { cookie: `sessionId=${sessionId}` }, 
      transports: ['websocket'] 
    });

    sockets.push({ socket, id: user.id });

    socket.on('connect', () => metrics.connected++);
    socket.on('connect_error', () => metrics.errors++);
    socket.on('error', () => metrics.errors++);

    socket.on('match_found', () => {
      metrics.matched++;
      // Send message burst
      for (let j = 0; j < BURST_COUNT; j++) {
        const start = Date.now();
        socket.emit('message', { body: `Hello ${j}` }, () => {
          metrics.latencies.push(Date.now() - start);
        });
        metrics.messagesSent++;
      }
    });

    socket.on('message', () => {
      metrics.messagesReceived++;
    });

    // Add to queue
    if (i < QUEUE_SIZE) {
      setTimeout(() => socket.emit('find_match'), 1000);
    }
  }

  // Wait for activity
  await new Promise(r => setTimeout(r, 10000));

  const endMemory = process.memoryUsage().heapUsed;

  const avgLatency = metrics.latencies.reduce((a, b) => a + b, 0) / (metrics.latencies.length || 1);
  const p95Latency = metrics.latencies.sort((a,b)=>a-b)[Math.floor(metrics.latencies.length * 0.95)] || 0;

  console.log(`
--- Load Test Results ---
Concurrent Connections: ${metrics.connected}
Users Queued: ${QUEUE_SIZE}
Matches Formed (events): ${metrics.matched}
Messages Sent: ${metrics.messagesSent}
Messages Received: ${metrics.messagesReceived}
Errors: ${metrics.errors}
Latency: Avg ${avgLatency.toFixed(2)}ms | p95 ${p95Latency}ms
Memory: ${Math.round(startMemory/1024/1024)}MB -> ${Math.round(endMemory/1024/1024)}MB (+${Math.round((endMemory - startMemory)/1024/1024)}MB)
  `);

  process.exit(0);
}

run().catch(console.error);
