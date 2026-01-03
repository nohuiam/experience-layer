/**
 * learn_from_pattern Tool
 * Extract a lesson from recurring pattern with research-enhanced confidence
 */

import { getDatabase } from '../database/schema.js';
import {
  LearnFromPatternInput,
  LearnFromPatternResult,
  PATTERN_CONFIG
} from '../types.js';

/**
 * Learn a new lesson from a detected pattern
 */
export function learnFromPattern(input: LearnFromPatternInput): LearnFromPatternResult {
  const db = getDatabase();
  const now = Date.now();

  // Get the episodes referenced
  const episodes = db.getEpisodesByIds(input.episode_ids);

  if (episodes.length < PATTERN_CONFIG.minEpisodes) {
    throw new Error(`Need at least ${PATTERN_CONFIG.minEpisodes} episodes to form a lesson (got ${episodes.length})`);
  }

  // Calculate initial confidence based on episode evidence
  const successCount = episodes.filter(e => e.outcome === 'success').length;
  const successRate = successCount / episodes.length;

  // Base confidence on success rate and episode count
  const episodeCountBonus = Math.min(0.3, Math.log(episodes.length + 1) * 0.1);
  const avgUtility = episodes.reduce((sum, e) => sum + e.utility_score, 0) / episodes.length;
  const utilityBonus = avgUtility * 0.2;

  const initialConfidence = Math.min(0.9, Math.max(0.3,
    0.4 + successRate * 0.3 + episodeCountBonus + utilityBonus
  ));

  // Check if a pattern already exists, or create one
  let patternId: number | undefined;
  const existingPattern = db.findPatternByDescription(input.pattern_description);

  if (existingPattern) {
    patternId = existingPattern.id;

    // Update the pattern with new evidence
    db.updatePattern(existingPattern.id, {
      frequency: episodes.length,
      last_seen: now,
      last_validated: now,
      episode_ids: input.episode_ids
    });
  } else {
    // Create a new pattern
    const patternType = successRate > 0.6 ? 'success' : successRate < 0.4 ? 'failure' : 'correlation';

    patternId = db.insertPattern({
      pattern_type: patternType,
      description: input.pattern_description,
      episode_ids: input.episode_ids,
      frequency: episodes.length,
      last_seen: now,
      created_at: now,
      initial_confidence: initialConfidence,
      decay_constant: PATTERN_CONFIG.decayConstant,
      last_validated: now,
      times_applied: 0,
      times_succeeded: 0,
      discrimination_weight: successRate * Math.log(episodes.length + 1)
    });
  }

  // Extract contexts from episodes
  const contexts: string[] = [];
  const operationTypes = new Set<string>();

  for (const episode of episodes) {
    operationTypes.add(episode.operation_type);
    if (episode.server_name) {
      contexts.push(`server:${episode.server_name}`);
    }
    if (episode.metadata?.environment) {
      contexts.push(`env:${episode.metadata.environment}`);
    }
  }

  // Add operation types as contexts
  for (const opType of operationTypes) {
    contexts.push(`operation:${opType}`);
  }

  // Create the lesson
  const lessonId = db.insertLesson({
    statement: input.lesson_statement,
    pattern_id: patternId,
    contexts: [...new Set(contexts)], // Deduplicate
    initial_confidence: initialConfidence,
    decay_constant: PATTERN_CONFIG.decayConstant,
    last_validated: now,
    times_applied: 0,
    times_succeeded: 0,
    created_at: now
  });

  return {
    lesson_id: lessonId,
    created: true,
    initial_confidence: initialConfidence,
    pattern_id: patternId
  };
}

export const learnFromPatternTool = {
  name: 'learn_from_pattern',
  description: 'Extract a lesson from a recurring pattern. Requires at least 3 episodes. Calculates initial confidence based on success rate and episode quality.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern_description: {
        type: 'string',
        description: 'Description of the pattern observed'
      },
      episode_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'IDs of episodes that form this pattern'
      },
      lesson_statement: {
        type: 'string',
        description: 'The lesson to extract (e.g., "Run npm install before build")'
      }
    },
    required: ['pattern_description', 'episode_ids', 'lesson_statement']
  },
  handler: learnFromPattern
};
