/**
 * apply_lesson Tool
 * Mark a lesson as being used and track if it helped
 * Uses Bayesian-style weighted update for confidence
 */

import { getDatabase } from '../database/schema.js';
import {
  ApplyLessonInput,
  ApplyLessonResult,
  calculateCurrentConfidence,
  CONFIDENCE_THRESHOLDS
} from '../types.js';

/**
 * Apply a lesson and update its confidence based on outcome
 */
export function applyLesson(input: ApplyLessonInput): ApplyLessonResult {
  const db = getDatabase();

  // Get the lesson
  const lesson = db.getLesson(input.lesson_id);

  if (!lesson) {
    throw new Error(`Lesson ${input.lesson_id} not found`);
  }

  // Calculate previous confidence with temporal decay
  const previousConfidence = calculateCurrentConfidence(
    lesson.initial_confidence,
    lesson.decay_constant,
    lesson.last_validated
  );

  // Determine if this application succeeded
  const succeeded = input.outcome === 'success';
  const partialSuccess = input.outcome === 'partial';

  // Calculate new success rate
  const newTimesApplied = lesson.times_applied + 1;
  const newTimesSucceeded = lesson.times_succeeded + (succeeded ? 1 : partialSuccess ? 0.5 : 0);
  const successRate = newTimesSucceeded / newTimesApplied;

  // Bayesian-style weighted update: blend prior confidence with new evidence
  // Weight prior more heavily when we have few applications
  const priorWeight = Math.max(0.3, 1 - Math.log(newTimesApplied + 1) / 5);
  const evidenceWeight = 1 - priorWeight;

  // Calculate new initial confidence (reset to current level + update)
  const evidenceConfidence = succeeded ? 1.0 : partialSuccess ? 0.5 : 0.0;
  const newInitialConfidence = Math.max(0.1, Math.min(0.95,
    priorWeight * previousConfidence + evidenceWeight * (0.7 * successRate + 0.3 * evidenceConfidence)
  ));

  // Update the lesson
  db.updateLesson(input.lesson_id, {
    initial_confidence: newInitialConfidence,
    last_validated: Date.now(),
    times_applied: newTimesApplied,
    times_succeeded: Math.round(newTimesSucceeded) // Store as integer
  });

  // Check if lesson should be deprecated
  if (newInitialConfidence < CONFIDENCE_THRESHOLDS.deprecation && newTimesApplied >= 5) {
    db.deprecateLesson(input.lesson_id);
  }

  // Also update related pattern if exists
  if (lesson.pattern_id) {
    const pattern = db.getPattern(lesson.pattern_id);
    if (pattern) {
      db.updatePattern(lesson.pattern_id, {
        times_applied: pattern.times_applied + 1,
        times_succeeded: pattern.times_succeeded + (succeeded ? 1 : 0),
        last_validated: Date.now()
      });
    }
  }

  return {
    applied: true,
    lesson_id: input.lesson_id,
    previous_confidence: previousConfidence,
    new_confidence: newInitialConfidence,
    total_applications: newTimesApplied,
    success_rate: successRate
  };
}

export const applyLessonTool = {
  name: 'apply_lesson',
  description: 'Mark a lesson as being used and track if it helped. Updates confidence using Bayesian-style weighted update. Auto-deprecates lessons with consistently low confidence.',
  inputSchema: {
    type: 'object',
    properties: {
      lesson_id: {
        type: 'number',
        description: 'ID of the lesson being applied'
      },
      outcome: {
        type: 'string',
        enum: ['success', 'failure', 'partial'],
        description: 'Result of applying the lesson'
      },
      notes: {
        type: 'string',
        description: 'Optional notes about the application'
      }
    },
    required: ['lesson_id', 'outcome']
  },
  handler: applyLesson
};
