/**
 * Experience Layer Type Definitions
 * Research-enhanced with CBR PSOM structure, temporal decay, and utility scoring
 */

// =============================================================================
// Configuration Constants (from Research)
// =============================================================================

export const PATTERN_CONFIG = {
  minEpisodes: 3,              // Minimum episodes to form pattern
  recencyWindowDays: 30,       // Look back window
  decayConstant: 0.01,         // k in e^(-kt) formula
  minDiscriminationWeight: 0.3 // Threshold to retain pattern
} as const;

export const UTILITY_WEIGHTS = {
  novelty: 0.3,
  effectiveness: 0.5,
  generalizability: 0.2
} as const;

export const CONFIDENCE_THRESHOLDS = {
  high: 0.7,
  medium: 0.4,
  deprecation: 0.1  // Auto-deprecate lessons below this
} as const;

// =============================================================================
// Core Entities (PSOM Structure from CBR Research)
// =============================================================================

/**
 * Episode - A single recorded experience
 * Uses PSOM structure: Problem, Solution, Outcome, Metadata
 */
export interface Episode {
  id: number;
  timestamp: number;
  operation_type: string;
  server_name?: string;

  // PSOM structure
  problem?: ProblemContext;
  solution?: SolutionContext;
  outcome: 'success' | 'failure' | 'partial';
  metadata?: EpisodeMetadata;

  quality_score?: number;
  duration_ms?: number;
  notes?: string;

  // Utility scoring (Research: α·novelty + β·effectiveness + γ·generalizability)
  novelty_score: number;
  effectiveness_score: number;
  generalizability_score: number;
  utility_score: number;
}

export interface ProblemContext {
  query?: string;
  constraints?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface SolutionContext {
  tool?: string;
  params?: Record<string, unknown>;
  approach?: string;
}

export interface EpisodeMetadata {
  environment?: string;
  dependencies?: string[];
  triggers?: string[];
}

/**
 * Pattern - Detected across multiple episodes
 * Enhanced with temporal decay and discrimination weighting
 */
export interface Pattern {
  id: number;
  pattern_type: 'success' | 'failure' | 'correlation';
  description: string;
  episode_ids: number[];

  // Frequency and timing
  frequency: number;
  last_seen: number;
  created_at: number;

  // Temporal decay (Research: CF(t) = CF₀ × e^(-kt))
  initial_confidence: number;
  decay_constant: number;
  last_validated: number;

  // Discrimination weight (Research: success_rate × frequency_weight × recency_bonus)
  times_applied: number;
  times_succeeded: number;
  discrimination_weight: number;
}

/**
 * Lesson - Extracted wisdom from patterns
 * Enhanced with temporal decay and application tracking
 */
export interface Lesson {
  id: number;
  statement: string;
  pattern_id?: number;
  contexts?: string[];

  // Temporal decay
  initial_confidence: number;
  decay_constant: number;
  last_validated: number;

  // Application tracking
  times_applied: number;
  times_succeeded: number;

  created_at: number;
  deprecated_at?: number;
}

// =============================================================================
// Tool Input Types
// =============================================================================

export interface RecordExperienceInput {
  operation_type: string;
  server_name?: string;
  problem?: ProblemContext;
  solution?: SolutionContext;
  outcome: 'success' | 'failure' | 'partial';
  metadata?: EpisodeMetadata;
  quality_score?: number;
  duration_ms?: number;
  notes?: string;
}

export interface RecallByTypeInput {
  operation_type: string;
  outcome_filter?: 'success' | 'failure' | 'partial';
  limit?: number;
}

export interface RecallByOutcomeInput {
  outcome: 'success' | 'failure' | 'partial';
  operation_type?: string;
  limit?: number;
}

export interface GetLessonsInput {
  context?: Record<string, unknown>;
  operation_type?: string;
  min_confidence?: number;
}

export interface ApplyLessonInput {
  lesson_id: number;
  outcome: 'success' | 'failure' | 'partial';
  notes?: string;
}

export interface LearnFromPatternInput {
  pattern_description: string;
  episode_ids: number[];
  lesson_statement: string;
}

// =============================================================================
// Tool Result Types
// =============================================================================

export interface RecordExperienceResult {
  episode_id: number;
  recorded: boolean;
  utility_score: number;
  patterns_triggered?: string[];
}

export interface RecallResult {
  episodes: Episode[];
  count: number;
  patterns_detected?: Pattern[];
  avg_utility: number;
}

export interface LessonWithConfidence extends Lesson {
  current_confidence: number;
}

export interface LessonsResult {
  lessons: LessonWithConfidence[];
  confidence_summary: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface ApplyLessonResult {
  applied: boolean;
  lesson_id: number;
  previous_confidence: number;
  new_confidence: number;
  total_applications: number;
  success_rate: number;
}

export interface LearnFromPatternResult {
  lesson_id: number;
  created: boolean;
  initial_confidence: number;
  pattern_id?: number;
}

// =============================================================================
// Confidence Calculation Helpers
// =============================================================================

export interface ConfidenceInfo {
  initial: number;
  current: number;
  decay_constant: number;
  days_since_validation: number;
  decay_factor: number;
}

/**
 * Calculate current confidence with temporal decay
 * Formula: CF(t) = CF₀ × e^(-kt)
 */
export function calculateCurrentConfidence(
  initialConfidence: number,
  decayConstant: number,
  lastValidated: number
): number {
  const daysSinceValidation = (Date.now() - lastValidated) / (24 * 60 * 60 * 1000);
  const decayFactor = Math.exp(-decayConstant * daysSinceValidation);
  return initialConfidence * decayFactor;
}

/**
 * Calculate utility score for an episode
 * Formula: U = α·novelty + β·effectiveness + γ·generalizability
 */
export function calculateUtilityScore(
  novelty: number,
  effectiveness: number,
  generalizability: number
): number {
  return (
    UTILITY_WEIGHTS.novelty * novelty +
    UTILITY_WEIGHTS.effectiveness * effectiveness +
    UTILITY_WEIGHTS.generalizability * generalizability
  );
}

/**
 * Calculate discrimination weight for a pattern
 * Formula: w = success_rate × frequency_weight × recency_bonus
 */
export function calculateDiscriminationWeight(
  timesSucceeded: number,
  timesApplied: number,
  frequency: number,
  lastSeen: number
): number {
  const successRate = timesApplied > 0 ? timesSucceeded / timesApplied : 0.5;
  const frequencyWeight = Math.log(frequency + 1);
  const daysSinceLastSeen = (Date.now() - lastSeen) / (24 * 60 * 60 * 1000);
  const recencyBonus = Math.exp(-PATTERN_CONFIG.decayConstant * daysSinceLastSeen);

  return successRate * frequencyWeight * recencyBonus;
}

// =============================================================================
// InterLock Signal Types
// =============================================================================

export interface Signal {
  code: number;
  name: string;
  sender: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export const SignalTypes = {
  // Incoming signals
  BUILD_COMPLETED: 0xB0,
  VERIFICATION_RESULT: 0xD0,
  VALIDATION_APPROVED: 0xC0,
  VALIDATION_REJECTED: 0xC1,
  OPERATION_COMPLETE: 0xFF,
  LESSON_LEARNED: 0xE5,
  CLAIM_VERIFIED: 0xD1,
  CLAIM_REFUTED: 0xD2,
  HEARTBEAT: 0x00,

  // Outgoing signals
  EXPERIENCE_RECORDED: 0xF0,
  PATTERN_EMERGED: 0xF1,
  LESSON_EXTRACTED: 0xF2,
  LESSON_VALIDATED: 0xF3
} as const;

// =============================================================================
// Database Row Types (for SQLite)
// =============================================================================

export interface EpisodeRow {
  id: number;
  timestamp: number;
  operation_type: string;
  server_name: string | null;
  problem: string | null;
  solution: string | null;
  outcome: string;
  metadata: string | null;
  quality_score: number | null;
  duration_ms: number | null;
  notes: string | null;
  novelty_score: number;
  effectiveness_score: number;
  generalizability_score: number;
  utility_score: number;
}

export interface PatternRow {
  id: number;
  pattern_type: string;
  description: string;
  episode_ids: string;
  frequency: number;
  last_seen: number;
  created_at: number;
  initial_confidence: number;
  decay_constant: number;
  last_validated: number;
  times_applied: number;
  times_succeeded: number;
  discrimination_weight: number;
}

export interface LessonRow {
  id: number;
  statement: string;
  pattern_id: number | null;
  contexts: string | null;
  initial_confidence: number;
  decay_constant: number;
  last_validated: number;
  times_applied: number;
  times_succeeded: number;
  created_at: number;
  deprecated_at: number | null;
}

// =============================================================================
// WebSocket Event Types
// =============================================================================

export type WebSocketEventType =
  | 'experience_recorded'
  | 'pattern_emerged'
  | 'lesson_extracted'
  | 'lesson_validated'
  | 'lesson_deprecated'
  | 'ping'
  | 'pong';

export interface WebSocketEvent {
  type: WebSocketEventType;
  data: unknown;
  timestamp: number;
}
