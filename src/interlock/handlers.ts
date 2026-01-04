/**
 * InterLock Signal Handlers
 * Process incoming mesh signals and route to appropriate handlers
 */

import { Signal, SignalTypes } from '../types.js';
import { getDatabase } from '../database/schema.js';
import { recordExperience } from '../tools/record-experience.js';
import { getSignalName } from './protocol.js';
import {
  broadcastExperienceRecorded,
  broadcastLessonValidated
} from '../websocket/server.js';

type SignalHandler = (signal: Signal) => void;

const handlers: Map<number, SignalHandler> = new Map();

/**
 * Register a handler for a signal type
 */
export function registerHandler(signalType: number, handler: SignalHandler): void {
  handlers.set(signalType, handler);
}

/**
 * Handle an incoming signal
 */
export function handleSignal(signal: Signal): void {
  const handler = handlers.get(signal.signalType);
  const signalName = getSignalName(signal.signalType);
  if (handler) {
    try {
      handler(signal);
    } catch (error) {
      console.error(`Error handling signal ${signalName}:`, error);
    }
  } else {
    console.log(`No handler for signal: ${signalName} (0x${signal.signalType.toString(16)})`);
  }
}

// ==========================================================================
// Built-in Signal Handlers
// ==========================================================================

/**
 * Handle BUILD_COMPLETED signal from Neurogenesis
 */
registerHandler(SignalTypes.BUILD_COMPLETED, (signal) => {
  const { sender, ...data } = signal.payload;
  console.log(`Received BUILD_COMPLETED from ${sender}`);

  const result = recordExperience({
    operation_type: 'build',
    server_name: sender,
    problem: { context: data.context as Record<string, unknown> },
    solution: { approach: data.approach as string },
    outcome: (data.success as boolean) ? 'success' : 'failure',
    metadata: { triggers: ['BUILD_COMPLETED'] },
    quality_score: data.quality_score as number,
    duration_ms: data.duration_ms as number,
    notes: data.notes as string
  });

  broadcastExperienceRecorded(result.episode_id, result.utility_score);
});

/**
 * Handle VERIFICATION_RESULT signal from Verifier
 */
registerHandler(SignalTypes.VERIFICATION_RESULT, (signal) => {
  const { sender, ...data } = signal.payload;
  console.log(`Received VERIFICATION_RESULT from ${sender}`);

  const result = recordExperience({
    operation_type: 'verification',
    server_name: sender,
    problem: { query: data.claim as string },
    solution: { tool: 'verifier', approach: data.method as string },
    outcome: (data.verified as boolean) ? 'success' : 'failure',
    metadata: { triggers: ['VERIFICATION_RESULT'] },
    quality_score: data.confidence as number,
    notes: data.notes as string
  });

  broadcastExperienceRecorded(result.episode_id, result.utility_score);
});

/**
 * Handle VALIDATION_APPROVED signal from Context Guardian
 */
registerHandler(SignalTypes.VALIDATION_APPROVED, (signal) => {
  const { sender, ...data } = signal.payload;
  console.log(`Received VALIDATION_APPROVED from ${sender}`);

  recordExperience({
    operation_type: 'validation',
    server_name: sender,
    problem: { context: data.context as Record<string, unknown> },
    solution: { approach: 'context-guardian-validation' },
    outcome: 'success',
    metadata: { triggers: ['VALIDATION_APPROVED'] },
    notes: data.notes as string
  });
});

/**
 * Handle VALIDATION_REJECTED signal from Context Guardian
 */
registerHandler(SignalTypes.VALIDATION_REJECTED, (signal) => {
  const { sender, ...data } = signal.payload;
  console.log(`Received VALIDATION_REJECTED from ${sender}`);

  recordExperience({
    operation_type: 'validation',
    server_name: sender,
    problem: { context: data.context as Record<string, unknown> },
    solution: { approach: 'context-guardian-validation' },
    outcome: 'failure',
    metadata: { triggers: ['VALIDATION_REJECTED'] },
    notes: data.reason as string
  });
});

/**
 * Handle OPERATION_COMPLETE signal from any server
 */
registerHandler(SignalTypes.OPERATION_COMPLETE, (signal) => {
  const { sender, ...data } = signal.payload;
  console.log(`Received OPERATION_COMPLETE from ${sender}`);

  recordExperience({
    operation_type: (data.operation_type as string) || 'unknown',
    server_name: sender,
    problem: data.problem as { query?: string; constraints?: Record<string, unknown> },
    solution: data.solution as { tool?: string; params?: Record<string, unknown> },
    outcome: (data.outcome as 'success' | 'failure' | 'partial') || 'partial',
    metadata: { triggers: ['OPERATION_COMPLETE'] },
    quality_score: data.quality_score as number,
    duration_ms: data.duration_ms as number,
    notes: data.notes as string
  });
});

/**
 * Handle LESSON_LEARNED signal from Consciousness
 */
registerHandler(SignalTypes.LESSON_LEARNED, (signal) => {
  const { sender, ...data } = signal.payload;
  console.log(`Received LESSON_LEARNED from ${sender}`);

  const db = getDatabase();

  // Store the lesson directly
  const lessonId = db.insertLesson({
    statement: (data.statement as string) || 'Unknown lesson',
    pattern_id: data.pattern_id as number,
    contexts: data.contexts as string[],
    initial_confidence: (data.confidence as number) || 0.5,
    decay_constant: 0.01,
    last_validated: Date.now(),
    times_applied: 0,
    times_succeeded: 0,
    created_at: Date.now()
  });

  console.log(`Stored lesson ${lessonId} from Consciousness`);
});

/**
 * Handle CLAIM_VERIFIED signal from Verifier
 */
registerHandler(SignalTypes.CLAIM_VERIFIED, (signal) => {
  const { sender, ...data } = signal.payload;
  console.log(`Received CLAIM_VERIFIED from ${sender}`);

  const lessonId = data.lesson_id as number;

  if (lessonId) {
    const db = getDatabase();
    const lesson = db.getLesson(lessonId);

    if (lesson) {
      const previousConfidence = lesson.initial_confidence;
      const newConfidence = Math.min(0.95, previousConfidence * 1.1);

      db.updateLesson(lessonId, {
        initial_confidence: newConfidence,
        last_validated: Date.now()
      });

      broadcastLessonValidated(lessonId, previousConfidence, newConfidence);
    }
  }
});

/**
 * Handle CLAIM_REFUTED signal from Verifier
 */
registerHandler(SignalTypes.CLAIM_REFUTED, (signal) => {
  const { sender, ...data } = signal.payload;
  console.log(`Received CLAIM_REFUTED from ${sender}`);

  const lessonId = data.lesson_id as number;

  if (lessonId) {
    const db = getDatabase();
    const lesson = db.getLesson(lessonId);

    if (lesson) {
      const previousConfidence = lesson.initial_confidence;
      const newConfidence = Math.max(0.1, previousConfidence * 0.7);

      db.updateLesson(lessonId, {
        initial_confidence: newConfidence,
        last_validated: Date.now()
      });

      broadcastLessonValidated(lessonId, previousConfidence, newConfidence);
    }
  }
});

/**
 * Handle HEARTBEAT signal
 */
registerHandler(SignalTypes.HEARTBEAT, (signal) => {
  // Just log heartbeats, no action needed
  const { sender } = signal.payload;
  console.log(`Heartbeat from ${sender}`);
});

export { handlers };
