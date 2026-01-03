/**
 * get_lessons Tool
 * Retrieve applicable lessons for current context with temporal decay
 */

import { getDatabase } from '../database/schema.js';
import {
  GetLessonsInput,
  LessonsResult,
  LessonWithConfidence,
  CONFIDENCE_THRESHOLDS
} from '../types.js';

/**
 * Get lessons applicable to current context
 */
export function getLessons(input: GetLessonsInput): LessonsResult {
  const db = getDatabase();
  const minConfidence = input.min_confidence ?? 0;

  // Get all active lessons with current confidence
  let lessons = db.getActiveLessons(minConfidence);

  // Filter by operation type if specified
  if (input.operation_type) {
    lessons = lessons.filter(lesson => {
      // Check if lesson statement or contexts mention the operation type
      if (lesson.statement.toLowerCase().includes(input.operation_type!.toLowerCase())) {
        return true;
      }
      if (lesson.contexts?.some(c => c.toLowerCase().includes(input.operation_type!.toLowerCase()))) {
        return true;
      }
      // Check related pattern
      if (lesson.pattern_id) {
        const pattern = db.getPattern(lesson.pattern_id);
        if (pattern?.description.toLowerCase().includes(input.operation_type!.toLowerCase())) {
          return true;
        }
      }
      return false;
    });
  }

  // Filter by context match if specified
  if (input.context) {
    const contextKeys = Object.keys(input.context);
    lessons = lessons.filter(lesson => {
      // Check if any context key matches lesson contexts
      return lesson.contexts?.some(c =>
        contextKeys.some(key =>
          c.toLowerCase().includes(key.toLowerCase()) ||
          String(input.context![key]).toLowerCase().includes(c.toLowerCase())
        )
      ) ?? true; // Include lessons without specific contexts
    });
  }

  // Sort by current confidence (highest first)
  lessons.sort((a, b) => b.current_confidence - a.current_confidence);

  // Calculate confidence summary
  const confidenceSummary = {
    high: lessons.filter(l => l.current_confidence >= CONFIDENCE_THRESHOLDS.high).length,
    medium: lessons.filter(l =>
      l.current_confidence >= CONFIDENCE_THRESHOLDS.medium &&
      l.current_confidence < CONFIDENCE_THRESHOLDS.high
    ).length,
    low: lessons.filter(l => l.current_confidence < CONFIDENCE_THRESHOLDS.medium).length
  };

  return {
    lessons,
    confidence_summary: confidenceSummary
  };
}

export const getLessonsTool = {
  name: 'get_lessons',
  description: 'Retrieve applicable lessons for current context. Returns lessons with current confidence (after temporal decay) and confidence summary.',
  inputSchema: {
    type: 'object',
    properties: {
      context: {
        type: 'object',
        description: 'Current context to match against lesson contexts'
      },
      operation_type: {
        type: 'string',
        description: 'Filter by operation type'
      },
      min_confidence: {
        type: 'number',
        description: 'Minimum confidence threshold (default: 0)'
      }
    },
    required: []
  },
  handler: getLessons
};
