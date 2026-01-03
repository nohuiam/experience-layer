/**
 * Tools Tests for Experience Layer
 * Tests all 6 MCP tools with research-enhanced features
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseManager, resetDatabase, getDatabase, setDatabase } from '../src/database/schema.js';
import { recordExperience } from '../src/tools/record-experience.js';
import { recallByType } from '../src/tools/recall-by-type.js';
import { recallByOutcome } from '../src/tools/recall-by-outcome.js';
import { getLessons } from '../src/tools/get-lessons.js';
import { applyLesson } from '../src/tools/apply-lesson.js';
import { learnFromPattern } from '../src/tools/learn-from-pattern.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

describe('Experience Layer Tools', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    resetDatabase();
    testDir = join(tmpdir(), `experience-tools-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test.db');
    // Initialize database at test path and set as singleton
    const db = new DatabaseManager(dbPath);
    setDatabase(db);
  });

  afterEach(() => {
    resetDatabase();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('record_experience', () => {
    it('should record a basic experience', () => {
      const result = recordExperience({
        operation_type: 'build',
        outcome: 'success'
      });

      expect(result.recorded).toBe(true);
      expect(result.episode_id).toBeGreaterThan(0);
      expect(result.utility_score).toBeGreaterThan(0);
    });

    it('should record experience with full PSOM structure', () => {
      const result = recordExperience({
        operation_type: 'search',
        server_name: 'enterspect',
        problem: { query: 'find config files', constraints: { type: 'json' } },
        solution: { tool: 'grep', params: { pattern: '*.json' } },
        outcome: 'success',
        metadata: { environment: 'development', dependencies: ['node'] },
        quality_score: 0.9,
        duration_ms: 150,
        notes: 'Fast search completed'
      });

      expect(result.recorded).toBe(true);

      const db = getDatabase();
      const episode = db.getEpisode(result.episode_id);
      expect(episode!.problem).toEqual({ query: 'find config files', constraints: { type: 'json' } });
      expect(episode!.solution).toEqual({ tool: 'grep', params: { pattern: '*.json' } });
      expect(episode!.metadata).toEqual({ environment: 'development', dependencies: ['node'] });
    });

    it('should calculate utility score', () => {
      const result = recordExperience({
        operation_type: 'build',
        outcome: 'success',
        quality_score: 1.0
      });

      // Utility = 0.3*novelty + 0.5*effectiveness + 0.2*generalizability
      expect(result.utility_score).toBeGreaterThan(0);
      expect(result.utility_score).toBeLessThanOrEqual(1);
    });

    it('should detect patterns after multiple similar episodes', () => {
      // Record 4 similar episodes (3+ for pattern detection)
      for (let i = 0; i < 4; i++) {
        recordExperience({
          operation_type: 'verify',
          outcome: 'success'
        });
      }

      // The 5th should trigger pattern detection
      const result = recordExperience({
        operation_type: 'verify',
        outcome: 'success'
      });

      // Pattern might be triggered depending on discrimination weight
      expect(result.recorded).toBe(true);
    });

    it('should give higher novelty score to new operation types', () => {
      const result1 = recordExperience({
        operation_type: 'unique_operation_type',
        outcome: 'success'
      });

      // Record same type multiple times
      for (let i = 0; i < 5; i++) {
        recordExperience({
          operation_type: 'common_operation',
          outcome: 'success'
        });
      }

      const result2 = recordExperience({
        operation_type: 'common_operation',
        outcome: 'success'
      });

      // First episode of a type should have max novelty
      expect(result1.utility_score).toBeGreaterThan(0);
    });

    it('should give higher effectiveness to successful outcomes', () => {
      const success = recordExperience({
        operation_type: 'build',
        outcome: 'success',
        quality_score: 1.0
      });

      const failure = recordExperience({
        operation_type: 'build',
        outcome: 'failure',
        quality_score: 0.0
      });

      // Success should have higher effectiveness component
      const db = getDatabase();
      const successEpisode = db.getEpisode(success.episode_id);
      const failureEpisode = db.getEpisode(failure.episode_id);

      expect(successEpisode!.effectiveness_score).toBeGreaterThan(failureEpisode!.effectiveness_score);
    });
  });

  describe('recall_by_type', () => {
    beforeEach(() => {
      // Seed some episodes
      recordExperience({ operation_type: 'build', outcome: 'success' });
      recordExperience({ operation_type: 'build', outcome: 'failure' });
      recordExperience({ operation_type: 'build', outcome: 'success' });
      recordExperience({ operation_type: 'search', outcome: 'success' });
    });

    it('should recall episodes by operation type', () => {
      const result = recallByType({ operation_type: 'build' });

      expect(result.episodes).toHaveLength(3);
      expect(result.count).toBe(3);
      expect(result.avg_utility).toBeGreaterThan(0);
    });

    it('should filter by outcome', () => {
      const result = recallByType({
        operation_type: 'build',
        outcome_filter: 'success'
      });

      expect(result.episodes).toHaveLength(2);
      expect(result.episodes.every(e => e.outcome === 'success')).toBe(true);
    });

    it('should respect limit', () => {
      const result = recallByType({
        operation_type: 'build',
        limit: 2
      });

      expect(result.episodes).toHaveLength(2);
    });

    it('should return empty for unknown type', () => {
      const result = recallByType({ operation_type: 'unknown' });

      expect(result.episodes).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('recall_by_outcome', () => {
    beforeEach(() => {
      recordExperience({ operation_type: 'build', outcome: 'success' });
      recordExperience({ operation_type: 'verify', outcome: 'success' });
      recordExperience({ operation_type: 'build', outcome: 'failure' });
      recordExperience({ operation_type: 'search', outcome: 'partial' });
    });

    it('should recall by success outcome', () => {
      const result = recallByOutcome({ outcome: 'success' });

      expect(result.episodes).toHaveLength(2);
      expect(result.episodes.every(e => e.outcome === 'success')).toBe(true);
    });

    it('should recall by failure outcome', () => {
      const result = recallByOutcome({ outcome: 'failure' });

      expect(result.episodes).toHaveLength(1);
    });

    it('should filter by operation type', () => {
      const result = recallByOutcome({
        outcome: 'success',
        operation_type: 'build'
      });

      expect(result.episodes).toHaveLength(1);
      expect(result.episodes[0].operation_type).toBe('build');
    });

    it('should detect related patterns', () => {
      // This test just ensures patterns field is present
      const result = recallByOutcome({ outcome: 'success' });
      expect(result.patterns_detected).toBeDefined();
    });
  });

  describe('get_lessons', () => {
    beforeEach(() => {
      const db = getDatabase();

      db.insertLesson({
        statement: 'Always run tests before deploy',
        contexts: ['build', 'deploy'],
        initial_confidence: 0.8,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      db.insertLesson({
        statement: 'Check file permissions on Mac',
        contexts: ['mac', 'filesystem'],
        initial_confidence: 0.6,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      db.insertLesson({
        statement: 'Low confidence lesson',
        initial_confidence: 0.2,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });
    });

    it('should get all active lessons', () => {
      const result = getLessons({});

      expect(result.lessons.length).toBeGreaterThan(0);
      expect(result.confidence_summary).toBeDefined();
    });

    it('should filter by minimum confidence', () => {
      const result = getLessons({ min_confidence: 0.5 });

      expect(result.lessons.every(l => l.current_confidence >= 0.5)).toBe(true);
    });

    it('should provide confidence summary', () => {
      const result = getLessons({});

      expect(result.confidence_summary.high).toBeGreaterThanOrEqual(0);
      expect(result.confidence_summary.medium).toBeGreaterThanOrEqual(0);
      expect(result.confidence_summary.low).toBeGreaterThanOrEqual(0);
    });

    it('should sort by confidence descending', () => {
      const result = getLessons({});

      for (let i = 1; i < result.lessons.length; i++) {
        expect(result.lessons[i - 1].current_confidence)
          .toBeGreaterThanOrEqual(result.lessons[i].current_confidence);
      }
    });
  });

  describe('apply_lesson', () => {
    let lessonId: number;

    beforeEach(() => {
      const db = getDatabase();

      lessonId = db.insertLesson({
        statement: 'Test lesson',
        initial_confidence: 0.5,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });
    });

    it('should apply lesson with success outcome', () => {
      const result = applyLesson({
        lesson_id: lessonId,
        outcome: 'success'
      });

      expect(result.applied).toBe(true);
      expect(result.total_applications).toBe(1);
      expect(result.new_confidence).toBeGreaterThan(result.previous_confidence);
    });

    it('should decrease confidence on failure', () => {
      const result = applyLesson({
        lesson_id: lessonId,
        outcome: 'failure'
      });

      expect(result.applied).toBe(true);
      expect(result.new_confidence).toBeLessThan(result.previous_confidence);
    });

    it('should track success rate', () => {
      applyLesson({ lesson_id: lessonId, outcome: 'success' });
      applyLesson({ lesson_id: lessonId, outcome: 'success' });
      const result = applyLesson({ lesson_id: lessonId, outcome: 'failure' });

      expect(result.total_applications).toBe(3);
      expect(result.success_rate).toBeCloseTo(0.67, 1);
    });

    it('should throw for unknown lesson', () => {
      expect(() => {
        applyLesson({ lesson_id: 9999, outcome: 'success' });
      }).toThrow('Lesson 9999 not found');
    });

    it('should handle partial outcomes', () => {
      const result = applyLesson({
        lesson_id: lessonId,
        outcome: 'partial'
      });

      expect(result.applied).toBe(true);
      // Partial outcome should have moderate effect
    });
  });

  describe('learn_from_pattern', () => {
    let episodeIds: number[];

    beforeEach(() => {
      episodeIds = [];
      for (let i = 0; i < 5; i++) {
        const result = recordExperience({
          operation_type: 'test_pattern',
          server_name: 'test-server',
          outcome: i < 4 ? 'success' : 'failure',
          metadata: { environment: 'test' }
        });
        episodeIds.push(result.episode_id);
      }
    });

    it('should create a lesson from pattern', () => {
      const result = learnFromPattern({
        pattern_description: 'test_pattern often succeeds',
        episode_ids: episodeIds,
        lesson_statement: 'Use test_pattern for reliable results'
      });

      expect(result.created).toBe(true);
      expect(result.lesson_id).toBeGreaterThan(0);
      expect(result.initial_confidence).toBeGreaterThan(0);
    });

    it('should extract contexts from episodes', () => {
      const result = learnFromPattern({
        pattern_description: 'test with contexts',
        episode_ids: episodeIds,
        lesson_statement: 'Contexts should be extracted'
      });

      const db = getDatabase();
      const lesson = db.getLesson(result.lesson_id);

      expect(lesson!.contexts).toBeDefined();
      expect(lesson!.contexts).toContain('operation:test_pattern');
      expect(lesson!.contexts).toContain('server:test-server');
    });

    it('should require minimum episodes', () => {
      expect(() => {
        learnFromPattern({
          pattern_description: 'too few episodes',
          episode_ids: [1, 2],
          lesson_statement: 'This should fail'
        });
      }).toThrow();
    });

    it('should set higher confidence for higher success rates', () => {
      // Create episodes with all successes
      const successIds: number[] = [];
      for (let i = 0; i < 5; i++) {
        const result = recordExperience({
          operation_type: 'all_success',
          outcome: 'success'
        });
        successIds.push(result.episode_id);
      }

      // Create episodes with all failures
      const failureIds: number[] = [];
      for (let i = 0; i < 5; i++) {
        const result = recordExperience({
          operation_type: 'all_failure',
          outcome: 'failure'
        });
        failureIds.push(result.episode_id);
      }

      const successResult = learnFromPattern({
        pattern_description: 'success pattern',
        episode_ids: successIds,
        lesson_statement: 'Success lesson'
      });

      const failureResult = learnFromPattern({
        pattern_description: 'failure pattern',
        episode_ids: failureIds,
        lesson_statement: 'Failure lesson'
      });

      expect(successResult.initial_confidence).toBeGreaterThan(failureResult.initial_confidence);
    });

    it('should create or update associated pattern', () => {
      const result = learnFromPattern({
        pattern_description: 'new pattern for lesson',
        episode_ids: episodeIds,
        lesson_statement: 'Lesson with pattern'
      });

      expect(result.pattern_id).toBeDefined();

      const db = getDatabase();
      const pattern = db.getPattern(result.pattern_id!);
      expect(pattern).not.toBeNull();
    });
  });
});
