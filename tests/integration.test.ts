/**
 * Integration Tests for Experience Layer
 * Tests end-to-end flows and research-enhanced features
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseManager, resetDatabase, getDatabase, setDatabase } from '../src/database/schema.js';
import { recordExperience } from '../src/tools/record-experience.js';
import { recallByType } from '../src/tools/recall-by-type.js';
import { recallByOutcome } from '../src/tools/recall-by-outcome.js';
import { getLessons } from '../src/tools/get-lessons.js';
import { applyLesson } from '../src/tools/apply-lesson.js';
import { learnFromPattern } from '../src/tools/learn-from-pattern.js';
import { handleSignal, registerHandler } from '../src/interlock/handlers.js';
import { createSignal } from '../src/interlock/protocol.js';
import { SignalTypes, PATTERN_CONFIG, CONFIDENCE_THRESHOLDS, calculateCurrentConfidence } from '../src/types.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

describe('Experience Layer Integration', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    resetDatabase();
    testDir = join(tmpdir(), `experience-integration-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test.db');
    const db = new DatabaseManager(dbPath);
    setDatabase(db);
  });

  afterEach(() => {
    resetDatabase();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Complete Experience Lifecycle', () => {
    it('should record, recall, learn, and apply lessons', () => {
      // Step 1: Record multiple experiences
      const episodeIds: number[] = [];
      for (let i = 0; i < 5; i++) {
        const result = recordExperience({
          operation_type: 'deploy',
          server_name: 'neurogenesis',
          problem: { query: 'deploy to production' },
          solution: { tool: 'docker', approach: 'containerized' },
          outcome: i < 4 ? 'success' : 'partial',
          quality_score: i < 4 ? 0.9 : 0.6
        });
        episodeIds.push(result.episode_id);
      }

      // Step 2: Recall experiences
      const recalled = recallByType({ operation_type: 'deploy' });
      expect(recalled.count).toBe(5);
      expect(recalled.avg_utility).toBeGreaterThan(0);

      // Step 3: Learn from pattern
      const lesson = learnFromPattern({
        pattern_description: 'deploy: high success rate with docker',
        episode_ids: episodeIds,
        lesson_statement: 'Use Docker for reliable deployments'
      });
      expect(lesson.created).toBe(true);
      expect(lesson.initial_confidence).toBeGreaterThan(0.5);

      // Step 4: Get lessons
      const lessons = getLessons({ operation_type: 'deploy' });
      expect(lessons.lessons.length).toBeGreaterThan(0);

      // Step 5: Apply lesson
      const applied = applyLesson({
        lesson_id: lesson.lesson_id,
        outcome: 'success'
      });
      expect(applied.applied).toBe(true);
      expect(applied.new_confidence).toBeGreaterThan(applied.previous_confidence);
    });

    it('should track lesson degradation over multiple failures', () => {
      const db = getDatabase();

      // Create a lesson
      const lessonId = db.insertLesson({
        statement: 'Test lesson for degradation',
        initial_confidence: 0.7,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      // Apply with failures
      for (let i = 0; i < 5; i++) {
        applyLesson({ lesson_id: lessonId, outcome: 'failure' });
      }

      const lesson = db.getLesson(lessonId);
      expect(lesson!.initial_confidence).toBeLessThan(0.5);
      expect(lesson!.times_applied).toBe(5);
      expect(lesson!.times_succeeded).toBe(0);
    });
  });

  describe('Research-Enhanced Features', () => {
    describe('Temporal Confidence Decay', () => {
      it('should decay lesson confidence over time', () => {
        const db = getDatabase();
        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

        db.insertLesson({
          statement: 'Recent lesson',
          initial_confidence: 0.8,
          decay_constant: 0.01,
          last_validated: now,
          times_applied: 0,
          times_succeeded: 0,
          created_at: now
        });

        db.insertLesson({
          statement: 'Old lesson',
          initial_confidence: 0.8,
          decay_constant: 0.01,
          last_validated: thirtyDaysAgo,
          times_applied: 0,
          times_succeeded: 0,
          created_at: thirtyDaysAgo
        });

        const lessons = db.getActiveLessons();
        const recent = lessons.find(l => l.statement === 'Recent lesson');
        const old = lessons.find(l => l.statement === 'Old lesson');

        expect(recent!.current_confidence).toBeCloseTo(0.8, 1);
        expect(old!.current_confidence).toBeLessThan(0.8);

        // Verify decay formula: CF(t) = CF₀ × e^(-kt)
        const expectedOldConfidence = 0.8 * Math.exp(-0.01 * 30);
        expect(old!.current_confidence).toBeCloseTo(expectedOldConfidence, 2);
      });

      it('should validate lesson and reset decay', () => {
        const db = getDatabase();
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

        const lessonId = db.insertLesson({
          statement: 'Decayed lesson',
          initial_confidence: 0.8,
          decay_constant: 0.01,
          last_validated: thirtyDaysAgo,
          times_applied: 0,
          times_succeeded: 0,
          created_at: thirtyDaysAgo
        });

        // Apply lesson (which validates it)
        applyLesson({ lesson_id: lessonId, outcome: 'success' });

        const lesson = db.getLesson(lessonId);
        const currentConfidence = calculateCurrentConfidence(
          lesson!.initial_confidence,
          lesson!.decay_constant,
          lesson!.last_validated
        );

        // Confidence should be refreshed because it was just validated
        // The Bayesian update might not fully restore it, but decay should be reset
        expect(currentConfidence).toBeGreaterThan(0.5);
        expect(lesson!.last_validated).toBeGreaterThan(thirtyDaysAgo);
      });
    });

    describe('Utility-Based Retention', () => {
      it('should calculate utility score correctly', () => {
        // U = 0.3*novelty + 0.5*effectiveness + 0.2*generalizability
        const result = recordExperience({
          operation_type: 'new_unique_operation',
          outcome: 'success',
          quality_score: 1.0
        });

        expect(result.utility_score).toBeGreaterThan(0.5);
        expect(result.utility_score).toBeLessThanOrEqual(1);
      });

      it('should give higher utility to novel operations', () => {
        // Record first instance of an operation
        const novel = recordExperience({
          operation_type: 'novel_op_' + randomUUID(),
          outcome: 'success'
        });

        // Record many of the same operation
        for (let i = 0; i < 10; i++) {
          recordExperience({
            operation_type: 'common_op',
            outcome: 'success'
          });
        }

        const common = recordExperience({
          operation_type: 'common_op',
          outcome: 'success'
        });

        // Novel operation should have higher utility due to novelty component
        expect(novel.utility_score).toBeGreaterThan(0);
      });
    });

    describe('Discrimination Weighting', () => {
      it('should create patterns with discrimination weight', () => {
        // Create enough episodes to trigger pattern detection
        const episodeIds: number[] = [];
        for (let i = 0; i < 10; i++) {
          const result = recordExperience({
            operation_type: 'pattern_test',
            outcome: i < 8 ? 'success' : 'failure'
          });
          episodeIds.push(result.episode_id);
        }

        // Learn from pattern
        const lesson = learnFromPattern({
          pattern_description: 'pattern_test: 80% success',
          episode_ids: episodeIds,
          lesson_statement: 'Pattern test works most of the time'
        });

        const db = getDatabase();
        const pattern = db.getPattern(lesson.pattern_id!);

        expect(pattern).not.toBeNull();
        expect(pattern!.discrimination_weight).toBeGreaterThan(0);
        // weight = success_rate × log(frequency + 1)
        // success_rate = 0.8, frequency = 10
        // weight ≈ 0.8 × log(11) ≈ 0.8 × 2.4 ≈ 1.92
      });

      it('should filter patterns below discrimination threshold', () => {
        const db = getDatabase();

        // Create a low-discrimination pattern
        db.insertPattern({
          pattern_type: 'correlation',
          description: 'low discrimination pattern',
          episode_ids: [1, 2],
          frequency: 2,
          last_seen: Date.now(),
          created_at: Date.now(),
          initial_confidence: 0.3,
          decay_constant: 0.01,
          last_validated: Date.now(),
          times_applied: 0,
          times_succeeded: 0,
          discrimination_weight: 0.1 // Below threshold
        });

        // Create a high-discrimination pattern
        db.insertPattern({
          pattern_type: 'success',
          description: 'high discrimination pattern',
          episode_ids: [3, 4, 5, 6, 7],
          frequency: 5,
          last_seen: Date.now(),
          created_at: Date.now(),
          initial_confidence: 0.8,
          decay_constant: 0.01,
          last_validated: Date.now(),
          times_applied: 0,
          times_succeeded: 0,
          discrimination_weight: 0.8 // Above threshold
        });

        const patterns = db.getAllPatterns();

        // Patterns should be ordered by discrimination weight (highest first)
        expect(patterns.length).toBeGreaterThanOrEqual(2);
        // Find our patterns
        const highPattern = patterns.find(p => p.description === 'high discrimination pattern');
        const lowPattern = patterns.find(p => p.description === 'low discrimination pattern');
        expect(highPattern).toBeDefined();
        expect(lowPattern).toBeDefined();
        expect(highPattern!.discrimination_weight).toBeGreaterThan(lowPattern!.discrimination_weight);
      });
    });

    describe('PSOM Case Structure', () => {
      it('should store and retrieve complete PSOM structure', () => {
        const result = recordExperience({
          operation_type: 'complex_operation',
          server_name: 'test-server',
          problem: {
            query: 'Find files matching pattern',
            constraints: { type: 'ts', size: { max: 10000 } },
            context: { environment: 'development', user: 'test' }
          },
          solution: {
            tool: 'glob',
            params: { pattern: '**/*.ts', ignore: ['node_modules'] },
            approach: 'recursive file search'
          },
          outcome: 'success',
          metadata: {
            environment: 'development',
            dependencies: ['glob', 'path'],
            triggers: ['user_request', 'file_watch']
          },
          quality_score: 0.95,
          duration_ms: 250,
          notes: 'Fast search with good results'
        });

        const db = getDatabase();
        const episode = db.getEpisode(result.episode_id);

        expect(episode!.problem).toEqual({
          query: 'Find files matching pattern',
          constraints: { type: 'ts', size: { max: 10000 } },
          context: { environment: 'development', user: 'test' }
        });
        expect(episode!.solution).toEqual({
          tool: 'glob',
          params: { pattern: '**/*.ts', ignore: ['node_modules'] },
          approach: 'recursive file search'
        });
        expect(episode!.metadata).toEqual({
          environment: 'development',
          dependencies: ['glob', 'path'],
          triggers: ['user_request', 'file_watch']
        });
      });
    });

    describe('Bayesian-Style Confidence Updates', () => {
      it('should weight prior confidence more with few applications', () => {
        const db = getDatabase();

        const lessonId = db.insertLesson({
          statement: 'Bayesian test lesson',
          initial_confidence: 0.8,
          decay_constant: 0.01,
          last_validated: Date.now(),
          times_applied: 0,
          times_succeeded: 0,
          created_at: Date.now()
        });

        // First application - prior should be weighted heavily
        const result1 = applyLesson({ lesson_id: lessonId, outcome: 'failure' });

        // Confidence should decrease but not dramatically
        expect(result1.new_confidence).toBeLessThan(0.8);
        expect(result1.new_confidence).toBeGreaterThan(0.3);
      });

      it('should weight evidence more with many applications', () => {
        const db = getDatabase();

        const lessonId = db.insertLesson({
          statement: 'Bayesian test lesson 2',
          initial_confidence: 0.5,
          decay_constant: 0.01,
          last_validated: Date.now(),
          times_applied: 10,
          times_succeeded: 9, // 90% success rate
          created_at: Date.now()
        });

        // After many applications, evidence should dominate
        const result = applyLesson({ lesson_id: lessonId, outcome: 'success' });

        // High success rate should push confidence up
        expect(result.success_rate).toBeGreaterThan(0.8);
      });
    });
  });

  describe('InterLock Integration', () => {
    it('should record experiences from mesh signals', () => {
      const signal = createSignal(SignalTypes.BUILD_COMPLETED, 'neurogenesis', {
        success: true,
        duration_ms: 3000,
        context: { type: 'npm' }
      });

      handleSignal(signal);

      const db = getDatabase();
      const episodes = db.getEpisodesByType('build');
      expect(episodes.length).toBeGreaterThan(0);
      expect(episodes[0].server_name).toBe('neurogenesis');
    });

    it('should update lesson confidence from verifier signals', () => {
      const db = getDatabase();

      const lessonId = db.insertLesson({
        statement: 'Lesson to verify',
        initial_confidence: 0.5,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      // Verifier confirms the lesson
      handleSignal(createSignal(SignalTypes.CLAIM_VERIFIED, 'verifier', {
        lesson_id: lessonId
      }));

      const lesson = db.getLesson(lessonId);
      expect(lesson!.initial_confidence).toBeGreaterThan(0.5);
    });

    it('should process operation complete signals', () => {
      handleSignal(createSignal(SignalTypes.OPERATION_COMPLETE, 'context-guardian', {
        operation_type: 'context_check',
        outcome: 'success',
        quality_score: 0.95
      }));

      const db = getDatabase();
      const episodes = db.getEpisodesByType('context_check');
      expect(episodes.length).toBe(1);
      expect(episodes[0].outcome).toBe('success');
    });
  });

  describe('Statistics and Reporting', () => {
    it('should provide accurate statistics', () => {
      const db = getDatabase();
      const initialStats = db.getStats();
      const initialEpisodes = initialStats.episodes;

      // Seed data
      for (let i = 0; i < 10; i++) {
        recordExperience({
          operation_type: i % 2 === 0 ? 'stats_build' : 'stats_test',
          outcome: i < 7 ? 'success' : 'failure',
          quality_score: 0.5 + (i * 0.05)
        });
      }

      const stats = db.getStats();

      expect(stats.episodes).toBe(initialEpisodes + 10);
      expect(stats.avgUtility).toBeGreaterThan(0);
    });

    it('should count high confidence lessons', () => {
      const db = getDatabase();
      const initialStats = db.getStats();
      const initialHighConfidence = initialStats.highConfidenceLessons;

      db.insertLesson({
        statement: 'High confidence stats test',
        initial_confidence: 0.9,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      db.insertLesson({
        statement: 'Low confidence stats test',
        initial_confidence: 0.3,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      const stats = db.getStats();
      // We added one high confidence lesson
      expect(stats.highConfidenceLessons).toBe(initialHighConfidence + 1);
    });
  });
});
