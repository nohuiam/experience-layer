/**
 * recall_by_outcome Tool
 * Get experiences by outcome (success/failure/partial)
 */

import { getDatabase } from '../database/schema.js';
import { RecallByOutcomeInput, RecallResult } from '../types.js';

/**
 * Recall episodes by outcome
 */
export function recallByOutcome(input: RecallByOutcomeInput): RecallResult {
  const db = getDatabase();
  const limit = input.limit ?? 50;

  // Get episodes by outcome
  const episodes = db.getEpisodesByOutcome(
    input.outcome,
    input.operation_type,
    limit
  );

  // Get patterns related to this outcome type
  const allPatterns = db.getAllPatterns();
  const patternType = input.outcome === 'success' ? 'success' :
                      input.outcome === 'failure' ? 'failure' : 'correlation';
  const relatedPatterns = allPatterns.filter(p => p.pattern_type === patternType);

  // Calculate average utility
  const avgUtility = episodes.length > 0
    ? episodes.reduce((sum, e) => sum + e.utility_score, 0) / episodes.length
    : 0;

  return {
    episodes,
    count: episodes.length,
    patterns_detected: relatedPatterns,
    avg_utility: avgUtility
  };
}

export const recallByOutcomeTool = {
  name: 'recall_by_outcome',
  description: 'Get experiences by outcome type (success, failure, partial). Useful for analyzing what works and what doesn\'t.',
  inputSchema: {
    type: 'object',
    properties: {
      outcome: {
        type: 'string',
        enum: ['success', 'failure', 'partial'],
        description: 'Outcome type to recall'
      },
      operation_type: {
        type: 'string',
        description: 'Optional filter by operation type'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of episodes to return (default: 50)'
      }
    },
    required: ['outcome']
  },
  handler: recallByOutcome
};
