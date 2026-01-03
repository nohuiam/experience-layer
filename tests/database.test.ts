/**
 * Database Tests for Experience Layer
 * Tests CRUD operations, utility scoring, and temporal decay
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DatabaseManager } from '../src/database/schema.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { calculateCurrentConfidence } from '../src/types.js';

describe('DatabaseManager', () => {
  let db: DatabaseManager;
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `experience-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test.db');
    db = new DatabaseManager(dbPath);
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Episode Operations', () => {
    it('should insert and retrieve an episode', () => {
      const episodeId = db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'build',
        server_name: 'neurogenesis',
        outcome: 'success',
        novelty_score: 0.8,
        effectiveness_score: 1.0,
        generalizability_score: 0.6,
        utility_score: 0.77
      });

      expect(episodeId).toBeGreaterThan(0);

      const episode = db.getEpisode(episodeId);
      expect(episode).not.toBeNull();
      expect(episode!.operation_type).toBe('build');
      expect(episode!.outcome).toBe('success');
    });

    it('should store and retrieve PSOM structure', () => {
      const episodeId = db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'search',
        outcome: 'success',
        problem: { query: 'find files', constraints: { type: 'ts' } },
        solution: { tool: 'glob', params: { pattern: '*.ts' } },
        metadata: { environment: 'development', dependencies: ['node'] },
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });

      const episode = db.getEpisode(episodeId);
      expect(episode!.problem).toEqual({ query: 'find files', constraints: { type: 'ts' } });
      expect(episode!.solution).toEqual({ tool: 'glob', params: { pattern: '*.ts' } });
      expect(episode!.metadata).toEqual({ environment: 'development', dependencies: ['node'] });
    });

    it('should get episodes by type', () => {
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'build',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'build',
        outcome: 'failure',
        novelty_score: 0.5,
        effectiveness_score: 0,
        generalizability_score: 0.5,
        utility_score: 0.35
      });
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'search',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });

      const buildEpisodes = db.getEpisodesByType('build');
      expect(buildEpisodes).toHaveLength(2);
    });

    it('should get episodes by outcome', () => {
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'build',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'build',
        outcome: 'failure',
        novelty_score: 0.5,
        effectiveness_score: 0,
        generalizability_score: 0.5,
        utility_score: 0.35
      });
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'verify',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });

      const successes = db.getEpisodesByOutcome('success');
      expect(successes).toHaveLength(2);

      const failures = db.getEpisodesByOutcome('failure');
      expect(failures).toHaveLength(1);
    });

    it('should respect since parameter', () => {
      const oldTime = Date.now() - 100000;
      const newTime = Date.now();

      db.insertEpisode({
        timestamp: oldTime,
        operation_type: 'build',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });
      db.insertEpisode({
        timestamp: newTime,
        operation_type: 'build',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });

      const recentEpisodes = db.getEpisodesByType('build', newTime - 1000);
      expect(recentEpisodes).toHaveLength(1);
    });

    it('should calculate average utility', () => {
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'build',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'build',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 0.8,
        generalizability_score: 0.5,
        utility_score: 0.55
      });

      const avgUtility = db.getAverageUtility('build');
      expect(avgUtility).toBeCloseTo(0.6, 1);
    });

    it('should get episodes by IDs', () => {
      const id1 = db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'build',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });
      const id2 = db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'verify',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'search',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });

      const episodes = db.getEpisodesByIds([id1, id2]);
      expect(episodes).toHaveLength(2);
    });

    it('should return empty array for empty ID list', () => {
      const episodes = db.getEpisodesByIds([]);
      expect(episodes).toHaveLength(0);
    });
  });

  describe('Pattern Operations', () => {
    it('should insert and retrieve a pattern', () => {
      const patternId = db.insertPattern({
        pattern_type: 'success',
        description: 'build: 80% success rate over 10 episodes',
        episode_ids: [1, 2, 3],
        frequency: 10,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.7,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.56
      });

      expect(patternId).toBeGreaterThan(0);

      const pattern = db.getPattern(patternId);
      expect(pattern).not.toBeNull();
      expect(pattern!.pattern_type).toBe('success');
      expect(pattern!.episode_ids).toEqual([1, 2, 3]);
    });

    it('should get patterns by type', () => {
      db.insertPattern({
        pattern_type: 'success',
        description: 'success pattern 1',
        episode_ids: [1],
        frequency: 5,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.7,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.5
      });
      db.insertPattern({
        pattern_type: 'failure',
        description: 'failure pattern 1',
        episode_ids: [2],
        frequency: 3,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.6,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.4
      });

      const successPatterns = db.getPatternsByType('success');
      expect(successPatterns).toHaveLength(1);

      const failurePatterns = db.getPatternsByType('failure');
      expect(failurePatterns).toHaveLength(1);
    });

    it('should update pattern', () => {
      const patternId = db.insertPattern({
        pattern_type: 'success',
        description: 'test pattern',
        episode_ids: [1, 2],
        frequency: 5,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.5,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.3
      });

      db.updatePattern(patternId, {
        frequency: 10,
        discrimination_weight: 0.6,
        times_applied: 5,
        times_succeeded: 4
      });

      const updated = db.getPattern(patternId);
      expect(updated!.frequency).toBe(10);
      expect(updated!.discrimination_weight).toBe(0.6);
      expect(updated!.times_applied).toBe(5);
      expect(updated!.times_succeeded).toBe(4);
    });

    it('should find pattern by description', () => {
      db.insertPattern({
        pattern_type: 'success',
        description: 'build: 80% success rate',
        episode_ids: [1, 2, 3],
        frequency: 10,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.7,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.5
      });

      const found = db.findPatternByDescription('build');
      expect(found).not.toBeNull();
      expect(found!.description).toContain('build');
    });

    it('should order patterns by discrimination weight', () => {
      db.insertPattern({
        pattern_type: 'success',
        description: 'low weight',
        episode_ids: [1],
        frequency: 5,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.5,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.3
      });
      db.insertPattern({
        pattern_type: 'success',
        description: 'high weight',
        episode_ids: [2],
        frequency: 10,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.8,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.8
      });

      const patterns = db.getAllPatterns();
      expect(patterns[0].description).toBe('high weight');
    });
  });

  describe('Lesson Operations', () => {
    it('should insert and retrieve a lesson', () => {
      // First create a pattern to satisfy foreign key constraint
      const patternId = db.insertPattern({
        pattern_type: 'success',
        description: 'test pattern for lesson',
        episode_ids: [1],
        frequency: 5,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.7,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.5
      });

      const lessonId = db.insertLesson({
        statement: 'Run npm install before build',
        pattern_id: patternId,
        contexts: ['build', 'npm'],
        initial_confidence: 0.7,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      expect(lessonId).toBeGreaterThan(0);

      const lesson = db.getLesson(lessonId);
      expect(lesson).not.toBeNull();
      expect(lesson!.statement).toBe('Run npm install before build');
      expect(lesson!.contexts).toEqual(['build', 'npm']);
    });

    it('should get active lessons with current confidence', () => {
      const now = Date.now();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

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
        last_validated: tenDaysAgo,
        times_applied: 0,
        times_succeeded: 0,
        created_at: tenDaysAgo
      });

      const lessons = db.getActiveLessons();
      expect(lessons).toHaveLength(2);

      // Recent lesson should have higher current confidence
      const recentLesson = lessons.find(l => l.statement === 'Recent lesson');
      const oldLesson = lessons.find(l => l.statement === 'Old lesson');

      expect(recentLesson!.current_confidence).toBeGreaterThan(oldLesson!.current_confidence);
    });

    it('should filter by minimum confidence', () => {
      const now = Date.now();

      db.insertLesson({
        statement: 'High confidence',
        initial_confidence: 0.9,
        decay_constant: 0.01,
        last_validated: now,
        times_applied: 0,
        times_succeeded: 0,
        created_at: now
      });
      db.insertLesson({
        statement: 'Low confidence',
        initial_confidence: 0.3,
        decay_constant: 0.01,
        last_validated: now,
        times_applied: 0,
        times_succeeded: 0,
        created_at: now
      });

      const highConfidenceLessons = db.getActiveLessons(0.5);
      expect(highConfidenceLessons).toHaveLength(1);
      expect(highConfidenceLessons[0].statement).toBe('High confidence');
    });

    it('should update lesson', () => {
      const lessonId = db.insertLesson({
        statement: 'Test lesson',
        initial_confidence: 0.5,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      db.updateLesson(lessonId, {
        initial_confidence: 0.7,
        times_applied: 5,
        times_succeeded: 4
      });

      const updated = db.getLesson(lessonId);
      expect(updated!.initial_confidence).toBe(0.7);
      expect(updated!.times_applied).toBe(5);
      expect(updated!.times_succeeded).toBe(4);
    });

    it('should deprecate lesson', () => {
      const lessonId = db.insertLesson({
        statement: 'Test lesson',
        initial_confidence: 0.5,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      db.deprecateLesson(lessonId);

      const lesson = db.getLesson(lessonId);
      expect(lesson!.deprecated_at).toBeDefined();

      // Should not appear in active lessons
      const activeLessons = db.getActiveLessons();
      expect(activeLessons).toHaveLength(0);
    });

    it('should get lessons by pattern', () => {
      db.insertPattern({
        pattern_type: 'success',
        description: 'test pattern',
        episode_ids: [1],
        frequency: 5,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.7,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.5
      });

      db.insertLesson({
        statement: 'Lesson 1',
        pattern_id: 1,
        initial_confidence: 0.7,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });
      db.insertLesson({
        statement: 'Lesson 2',
        pattern_id: 1,
        initial_confidence: 0.6,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      const lessons = db.getLessonsByPattern(1);
      expect(lessons).toHaveLength(2);
    });
  });

  describe('Temporal Decay', () => {
    it('should calculate confidence decay correctly', () => {
      const initialConfidence = 0.8;
      const decayConstant = 0.01;
      const now = Date.now();

      // Just validated - should be close to initial
      const current1 = calculateCurrentConfidence(initialConfidence, decayConstant, now);
      expect(current1).toBeCloseTo(0.8, 1);

      // 30 days ago - should decay
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const current2 = calculateCurrentConfidence(initialConfidence, decayConstant, thirtyDaysAgo);
      expect(current2).toBeLessThan(0.8);
      expect(current2).toBeCloseTo(0.8 * Math.exp(-0.01 * 30), 2);

      // 100 days ago - significant decay
      const hundredDaysAgo = now - 100 * 24 * 60 * 60 * 1000;
      const current3 = calculateCurrentConfidence(initialConfidence, decayConstant, hundredDaysAgo);
      expect(current3).toBeLessThan(current2);
    });
  });

  describe('Statistics', () => {
    it('should get database stats', () => {
      db.insertEpisode({
        timestamp: Date.now(),
        operation_type: 'build',
        outcome: 'success',
        novelty_score: 0.5,
        effectiveness_score: 1.0,
        generalizability_score: 0.5,
        utility_score: 0.65
      });

      db.insertPattern({
        pattern_type: 'success',
        description: 'test',
        episode_ids: [1],
        frequency: 5,
        last_seen: Date.now(),
        created_at: Date.now(),
        initial_confidence: 0.7,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        discrimination_weight: 0.5
      });

      db.insertLesson({
        statement: 'Test',
        initial_confidence: 0.8,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      const stats = db.getStats();
      expect(stats.episodes).toBe(1);
      expect(stats.patterns).toBe(1);
      expect(stats.lessons).toBe(1);
      expect(stats.avgUtility).toBeCloseTo(0.65, 2);
    });
  });
});
