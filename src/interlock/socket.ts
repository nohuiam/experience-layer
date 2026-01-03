/**
 * InterLock UDP Socket
 * Handles mesh communication on port 3031
 */

import dgram from 'dgram';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Signal, SignalTypes } from '../types.js';
import { encodeSignal, decodeSignal, createSignal } from './protocol.js';
import { handleSignal } from './handlers.js';
import { isSignalAllowed } from './tumbler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PeerConfig {
  name: string;
  port: number;
}

interface InterlockConfig {
  server: { name: string; id: string; version: string };
  ports: { udp: number; http: number; websocket: number };
  peers: PeerConfig[];
}

let socket: dgram.Socket | null = null;
let config: InterlockConfig | null = null;
const SERVER_NAME = 'experience-layer';

/**
 * Load InterLock configuration
 */
function loadConfig(): InterlockConfig {
  if (config) return config;

  try {
    const configPath = join(__dirname, '../../config/interlock.json');
    config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config!;
  } catch (error) {
    console.error('Failed to load InterLock config:', error);
    // Return default config
    return {
      server: { name: SERVER_NAME, id: 'experience-layer-001', version: '1.0.0' },
      ports: { udp: 3031, http: 8031, websocket: 9031 },
      peers: []
    };
  }
}

/**
 * Start the InterLock UDP socket
 */
export function startInterlock(port?: number): dgram.Socket {
  const cfg = loadConfig();
  const udpPort = port ?? cfg.ports.udp;

  socket = dgram.createSocket('udp4');

  socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    try {
      const signal = decodeSignal(msg);

      // Filter through tumbler
      if (!isSignalAllowed(signal)) {
        console.log(`Signal ${signal.name} blocked by tumbler`);
        return;
      }

      console.log(`Received ${signal.name} from ${rinfo.address}:${rinfo.port}`);
      handleSignal(signal);
    } catch (error) {
      console.error('Error processing InterLock message:', error);
    }
  });

  socket.on('error', (error) => {
    console.error('InterLock socket error:', error);
  });

  socket.on('listening', () => {
    const address = socket!.address();
    console.log(`InterLock mesh listening on ${address.address}:${address.port}`);
  });

  socket.bind(udpPort);

  return socket;
}

/**
 * Send a signal to a specific peer
 */
export function sendToPeer(peerName: string, signal: Signal): void {
  if (!socket) {
    console.error('InterLock socket not initialized');
    return;
  }

  const cfg = loadConfig();
  const peer = cfg.peers.find(p => p.name === peerName);

  if (!peer) {
    console.error(`Unknown peer: ${peerName}`);
    return;
  }

  const buffer = encodeSignal(signal);
  socket.send(buffer, peer.port, 'localhost', (error) => {
    if (error) {
      console.error(`Failed to send to ${peerName}:`, error);
    } else {
      console.log(`Sent ${signal.name} to ${peerName}:${peer.port}`);
    }
  });
}

/**
 * Broadcast a signal to multiple peers
 */
export function broadcastSignal(signal: Signal, peerNames?: string[]): void {
  const cfg = loadConfig();
  const targets = peerNames ?? cfg.peers.map(p => p.name);

  for (const peerName of targets) {
    sendToPeer(peerName, signal);
  }
}

/**
 * Emit EXPERIENCE_RECORDED signal
 */
export function emitExperienceRecorded(episodeId: number, utilityScore: number): void {
  const signal = createSignal(SignalTypes.EXPERIENCE_RECORDED, SERVER_NAME, {
    episode_id: episodeId,
    utility_score: utilityScore
  });
  broadcastSignal(signal, ['consciousness']);
}

/**
 * Emit PATTERN_EMERGED signal
 */
export function emitPatternEmerged(patternId: number, description: string): void {
  const signal = createSignal(SignalTypes.PATTERN_EMERGED, SERVER_NAME, {
    pattern_id: patternId,
    description
  });
  broadcastSignal(signal, ['consciousness', 'trinity']);
}

/**
 * Emit LESSON_EXTRACTED signal
 */
export function emitLessonExtracted(lessonId: number, statement: string, confidence: number): void {
  const signal = createSignal(SignalTypes.LESSON_EXTRACTED, SERVER_NAME, {
    lesson_id: lessonId,
    statement,
    confidence
  });
  broadcastSignal(signal); // To all peers
}

/**
 * Emit LESSON_VALIDATED signal
 */
export function emitLessonValidated(lessonId: number, confidence: number): void {
  const signal = createSignal(SignalTypes.LESSON_VALIDATED, SERVER_NAME, {
    lesson_id: lessonId,
    confidence
  });
  broadcastSignal(signal, ['consciousness']);
}

/**
 * Get socket instance
 */
export function getSocket(): dgram.Socket | null {
  return socket;
}

/**
 * Close the InterLock socket
 */
export function closeInterlock(): void {
  if (socket) {
    socket.close();
    socket = null;
  }
}

/**
 * Get peer list
 */
export function getPeers(): PeerConfig[] {
  const cfg = loadConfig();
  return cfg.peers;
}
