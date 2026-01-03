/**
 * recall_by_type Tool
 * Get past experiences for an operation type
 */

import { getDatabase } from '../database/schema.js';
import { RecallByTypeInput, RecallResult } from '../types.js';

/**
 * Recall episodes by operation type
 */
export function recallByType(input: RecallByTypeInput): RecallResult {
  const db = getDatabase();
  const limit = input.limit ?? 50;

  // Get episodes by type
  let episodes = db.getEpisodesByType(input.operation_type, undefined, limit * 2);

  // Filter by outcome if specified
  if (input.outcome_filter) {
    episodes = episodes.filter(e => e.outcome === input.outcome_filter);
  }

  // Limit results
  episodes = episodes.slice(0, limit);

  // Get patterns related to this operation type
  const allPatterns = db.getAllPatterns();
  const relatedPatterns = allPatterns.filter(p =>
    p.description.includes(input.operation_type)
  );

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

export const recallByTypeTool = {
  name: 'recall_by_type',
  description: 'Get past experiences for a specific operation type. Returns episodes with patterns and utility metrics.',
  inputSchema: {
    type: 'object',
    properties: {
      operation_type: {
        type: 'string',
        description: 'Type of operation to recall (build, search, verify, etc.)'
      },
      outcome_filter: {
        type: 'string',
        enum: ['success', 'failure', 'partial'],
        description: 'Filter by outcome type'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of episodes to return (default: 50)'
      }
    },
    required: ['operation_type']
  },
  handler: recallByType
};
