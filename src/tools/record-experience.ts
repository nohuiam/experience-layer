/**
 * record_experience Tool
 * Store an episode with full context and outcome, calculate utility, detect patterns
 */

import { getDatabase } from '../database/schema.js';
import {
  RecordExperienceInput,
  RecordExperienceResult,
  Episode,
  Pattern,
  PATTERN_CONFIG,
  calculateUtilityScore,
  calculateDiscriminationWeight
} from '../types.js';

/**
 * Calculate novelty score for an episode
 * Based on how different this episode is from existing ones
 */
function calculateNoveltyScore(
  operationType: string,
  problem?: { query?: string; constraints?: Record<string, unknown> }
): number {
  const db = getDatabase();
  const recentEpisodes = db.getEpisodesByType(operationType, undefined, 50);

  if (recentEpisodes.length === 0) {
    return 1.0; // Completely novel
  }

  // Check for similar problems
  let similarCount = 0;
  for (const episode of recentEpisodes) {
    if (episode.problem?.query === problem?.query) {
      similarCount++;
    }
  }

  // More unique = higher novelty
  const similarityRatio = similarCount / recentEpisodes.length;
  return Math.max(0.1, 1.0 - similarityRatio);
}

/**
 * Calculate effectiveness score based on outcome
 */
function calculateEffectivenessScore(
  outcome: 'success' | 'failure' | 'partial',
  qualityScore?: number
): number {
  const baseScore = outcome === 'success' ? 1.0 : outcome === 'partial' ? 0.5 : 0.0;

  if (qualityScore !== undefined) {
    // Blend outcome with quality score
    return 0.6 * baseScore + 0.4 * qualityScore;
  }

  return baseScore;
}

/**
 * Calculate generalizability score
 * Higher if the episode context is more general/reusable
 */
function calculateGeneralizabilityScore(
  operationType: string,
  metadata?: { dependencies?: string[]; triggers?: string[] }
): number {
  // Fewer dependencies = more generalizable
  const depCount = metadata?.dependencies?.length ?? 0;
  const triggerCount = metadata?.triggers?.length ?? 0;

  const depPenalty = Math.min(0.3, depCount * 0.1);
  const triggerBonus = Math.min(0.2, triggerCount * 0.05);

  // Common operation types are more generalizable
  const db = getDatabase();
  const typeCount = db.getEpisodesByType(operationType, undefined, 1000).length;
  const typeBonus = Math.min(0.3, Math.log(typeCount + 1) * 0.1);

  return Math.max(0.1, Math.min(1.0, 0.5 - depPenalty + triggerBonus + typeBonus));
}

/**
 * Detect patterns after recording an episode
 * Uses discrimination weighting instead of simple frequency
 */
function detectPatterns(episode: Episode): Pattern[] {
  const db = getDatabase();
  const now = Date.now();
  const windowStart = now - PATTERN_CONFIG.recencyWindowDays * 24 * 60 * 60 * 1000;

  // Find similar episodes (same type, last 30 days)
  const similar = db.getEpisodesByType(episode.operation_type, windowStart, 500);

  if (similar.length < PATTERN_CONFIG.minEpisodes) {
    return [];
  }

  // Calculate discrimination weight (Research: success_rate × frequency_weight × recency_bonus)
  const successCount = similar.filter(e => e.outcome === 'success').length;
  const successRate = successCount / similar.length;
  const frequencyWeight = Math.log(similar.length + 1);

  // Recency bonus: more recent patterns get higher weight
  const avgAge = similar.reduce((sum, e) => sum + (now - e.timestamp), 0) / similar.length;
  const avgAgeDays = avgAge / (24 * 60 * 60 * 1000);
  const recencyBonus = Math.exp(-PATTERN_CONFIG.decayConstant * avgAgeDays);

  const discriminationWeight = successRate * frequencyWeight * recencyBonus;

  // Only create/update patterns with sufficient discrimination
  if (discriminationWeight < PATTERN_CONFIG.minDiscriminationWeight) {
    return [];
  }

  const patternType = successRate > 0.6 ? 'success' : successRate < 0.4 ? 'failure' : 'correlation';
  const description = `${episode.operation_type}: ${Math.round(successRate * 100)}% success rate over ${similar.length} episodes`;

  // Check if pattern already exists
  const existing = db.findPatternByDescription(episode.operation_type);

  if (existing) {
    // Update existing pattern
    db.updatePattern(existing.id, {
      frequency: similar.length,
      discrimination_weight: discriminationWeight,
      initial_confidence: (existing.initial_confidence + discriminationWeight) / 2,
      last_seen: now,
      last_validated: now,
      episode_ids: similar.map(e => e.id)
    });

    const updated = db.getPattern(existing.id);
    return updated ? [updated] : [];
  } else {
    // Create new pattern
    const patternId = db.insertPattern({
      pattern_type: patternType,
      description,
      episode_ids: similar.map(e => e.id),
      frequency: similar.length,
      last_seen: now,
      created_at: now,
      initial_confidence: Math.min(0.8, 0.4 + discriminationWeight),
      decay_constant: PATTERN_CONFIG.decayConstant,
      last_validated: now,
      times_applied: 0,
      times_succeeded: 0,
      discrimination_weight: discriminationWeight
    });

    const pattern = db.getPattern(patternId);
    return pattern ? [pattern] : [];
  }
}

/**
 * Record a new experience episode
 */
export function recordExperience(input: RecordExperienceInput): RecordExperienceResult {
  const db = getDatabase();
  const now = Date.now();

  // Calculate utility scores
  const noveltyScore = calculateNoveltyScore(input.operation_type, input.problem);
  const effectivenessScore = calculateEffectivenessScore(input.outcome, input.quality_score);
  const generalizabilityScore = calculateGeneralizabilityScore(
    input.operation_type,
    input.metadata
  );
  const utilityScore = calculateUtilityScore(noveltyScore, effectivenessScore, generalizabilityScore);

  // Create episode object
  const episode: Omit<Episode, 'id'> = {
    timestamp: now,
    operation_type: input.operation_type,
    server_name: input.server_name,
    problem: input.problem,
    solution: input.solution,
    outcome: input.outcome,
    metadata: input.metadata,
    quality_score: input.quality_score,
    duration_ms: input.duration_ms,
    notes: input.notes,
    novelty_score: noveltyScore,
    effectiveness_score: effectivenessScore,
    generalizability_score: generalizabilityScore,
    utility_score: utilityScore
  };

  // Insert episode
  const episodeId = db.insertEpisode(episode);

  // Get inserted episode for pattern detection
  const savedEpisode = db.getEpisode(episodeId);

  // Detect patterns
  const patterns = savedEpisode ? detectPatterns(savedEpisode) : [];

  return {
    episode_id: episodeId,
    recorded: true,
    utility_score: utilityScore,
    patterns_triggered: patterns.map(p => p.description)
  };
}

export const recordExperienceTool = {
  name: 'record_experience',
  description: 'Store an episode with full context and outcome. Calculates utility score and detects patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      operation_type: {
        type: 'string',
        description: 'Type of operation (build, search, verify, etc.)'
      },
      server_name: {
        type: 'string',
        description: 'Name of the server that performed the operation'
      },
      problem: {
        type: 'object',
        description: 'Problem context (query, constraints, context)',
        properties: {
          query: { type: 'string' },
          constraints: { type: 'object' },
          context: { type: 'object' }
        }
      },
      solution: {
        type: 'object',
        description: 'Solution applied (tool, params, approach)',
        properties: {
          tool: { type: 'string' },
          params: { type: 'object' },
          approach: { type: 'string' }
        }
      },
      outcome: {
        type: 'string',
        enum: ['success', 'failure', 'partial'],
        description: 'Result of the operation'
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata (environment, dependencies, triggers)',
        properties: {
          environment: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } },
          triggers: { type: 'array', items: { type: 'string' } }
        }
      },
      quality_score: {
        type: 'number',
        description: 'Quality score from 0 to 1'
      },
      duration_ms: {
        type: 'number',
        description: 'Duration of operation in milliseconds'
      },
      notes: {
        type: 'string',
        description: 'Additional notes about the experience'
      }
    },
    required: ['operation_type', 'outcome']
  },
  handler: recordExperience
};
