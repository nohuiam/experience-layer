/**
 * WebSocket Server for Experience Layer
 * Port 9031 - Real-time learning events
 */

import { WebSocketServer, WebSocket } from 'ws';
import { WebSocketEvent, WebSocketEventType } from '../types.js';

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

/**
 * Start the WebSocket server
 */
export function startWebSocketServer(port: number = 9031): WebSocketServer {
  wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`WebSocket client connected. Total clients: ${clients.size}`);

    ws.on('message', (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'ping') {
          ws.send(JSON.stringify({
            type: 'pong',
            data: { timestamp: Date.now() },
            timestamp: Date.now()
          }));
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`WebSocket client disconnected. Total clients: ${clients.size}`);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'experience_recorded',
      data: { message: 'Connected to Experience Layer WebSocket' },
      timestamp: Date.now()
    }));
  });

  console.log(`Experience Layer WebSocket server listening on port ${port}`);
  return wss;
}

/**
 * Broadcast an event to all connected clients
 */
export function broadcast(type: WebSocketEventType, data: unknown): void {
  const event: WebSocketEvent = {
    type,
    data,
    timestamp: Date.now()
  };

  const message = JSON.stringify(event);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * Broadcast experience recorded event
 */
export function broadcastExperienceRecorded(episodeId: number, utilityScore: number): void {
  broadcast('experience_recorded', {
    episode_id: episodeId,
    utility_score: utilityScore
  });
}

/**
 * Broadcast pattern emerged event
 */
export function broadcastPatternEmerged(patternId: number, description: string): void {
  broadcast('pattern_emerged', {
    pattern_id: patternId,
    description
  });
}

/**
 * Broadcast lesson extracted event
 */
export function broadcastLessonExtracted(
  lessonId: number,
  statement: string,
  confidence: number
): void {
  broadcast('lesson_extracted', {
    lesson_id: lessonId,
    statement,
    confidence
  });
}

/**
 * Broadcast lesson validated event
 */
export function broadcastLessonValidated(
  lessonId: number,
  previousConfidence: number,
  newConfidence: number
): void {
  broadcast('lesson_validated', {
    lesson_id: lessonId,
    previous_confidence: previousConfidence,
    new_confidence: newConfidence
  });
}

/**
 * Broadcast lesson deprecated event
 */
export function broadcastLessonDeprecated(lessonId: number, reason: string): void {
  broadcast('lesson_deprecated', {
    lesson_id: lessonId,
    reason
  });
}

/**
 * Get connected client count
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Close the WebSocket server
 */
export function closeWebSocketServer(): void {
  if (wss) {
    for (const client of clients) {
      client.close();
    }
    clients.clear();
    wss.close();
    wss = null;
  }
}

export { wss };
