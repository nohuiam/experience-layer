/**
 * Experience Layer Database Schema
 * Research-enhanced with PSOM structure, temporal decay, and utility scoring
 */

import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import {
  Episode,
  EpisodeRow,
  Pattern,
  PatternRow,
  Lesson,
  LessonRow,
  ProblemContext,
  SolutionContext,
  EpisodeMetadata,
  PATTERN_CONFIG,
  calculateCurrentConfidence,
  calculateUtilityScore,
  calculateDiscriminationWeight
} from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DB_PATH = join(DATA_DIR, 'experience.db');

/**
 * Database Manager for Experience Layer
 * Handles all CRUD operations for episodes, patterns, and lessons
 */
export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    // Ensure data directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
  }

  /**
   * Run a migration if it hasn't been applied yet
   * SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we catch the error
   */
  private runMigration(name: string, sql: string): void {
    try {
      this.db.exec(sql);
    } catch (err: unknown) {
      // Column already exists - this is expected for migrations
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('duplicate column name')) {
        console.warn(`Migration ${name} warning:`, message);
      }
    }
  }

  /**
   * Initialize database schema with research-enhanced tables
   */
  private initializeSchema(): void {
    // Episodes table - PSOM structure with utility scoring
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        operation_type TEXT NOT NULL,
        server_name TEXT,

        -- PSOM structure (Problem, Solution, Outcome, Metadata)
        problem TEXT,
        solution TEXT,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'partial')),
        metadata TEXT,

        quality_score REAL,
        duration_ms INTEGER,
        notes TEXT,

        -- Utility scoring (Research: α·novelty + β·effectiveness + γ·generalizability)
        novelty_score REAL DEFAULT 0.5,
        effectiveness_score REAL DEFAULT 0.5,
        generalizability_score REAL DEFAULT 0.5,
        utility_score REAL DEFAULT 0.5
      )
    `);

    // Episodes indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
      CREATE INDEX IF NOT EXISTS idx_episodes_type ON episodes(operation_type);
      CREATE INDEX IF NOT EXISTS idx_episodes_outcome ON episodes(outcome);
      CREATE INDEX IF NOT EXISTS idx_episodes_server ON episodes(server_name);
      CREATE INDEX IF NOT EXISTS idx_episodes_utility ON episodes(utility_score);
    `);

    // Migration: Add client metadata fields (Jan 2026)
    // These fields enable domain-specific queries for business intake
    this.runMigration('add_client_domain', `
      ALTER TABLE episodes ADD COLUMN client_domain TEXT
    `);
    this.runMigration('add_problem_category', `
      ALTER TABLE episodes ADD COLUMN problem_category TEXT
    `);
    this.runMigration('add_vertical', `
      ALTER TABLE episodes ADD COLUMN vertical TEXT
    `);
    this.runMigration('add_company_size', `
      ALTER TABLE episodes ADD COLUMN company_size TEXT
    `);

    // Indexes for domain-specific queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_episodes_domain ON episodes(client_domain);
      CREATE INDEX IF NOT EXISTS idx_episodes_category ON episodes(problem_category);
      CREATE INDEX IF NOT EXISTS idx_episodes_vertical ON episodes(vertical);
    `);

    // Patterns table - Enhanced with discrimination weight
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL CHECK (pattern_type IN ('success', 'failure', 'correlation')),
        description TEXT NOT NULL,
        episode_ids TEXT,

        -- Frequency and timing
        frequency INTEGER DEFAULT 1,
        last_seen INTEGER,
        created_at INTEGER,

        -- Temporal decay (Research: CF(t) = CF₀ × e^(-kt))
        initial_confidence REAL DEFAULT 0.5,
        decay_constant REAL DEFAULT 0.01,
        last_validated INTEGER,

        -- Discrimination weight (Research: success_rate × frequency_weight × recency_bonus)
        times_applied INTEGER DEFAULT 0,
        times_succeeded INTEGER DEFAULT 0,
        discrimination_weight REAL DEFAULT 0.5
      )
    `);

    // Patterns indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_patterns_weight ON patterns(discrimination_weight);
      CREATE INDEX IF NOT EXISTS idx_patterns_validated ON patterns(last_validated);
    `);

    // Lessons table - Enhanced with temporal decay
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        statement TEXT NOT NULL,
        pattern_id INTEGER,
        contexts TEXT,

        -- Temporal confidence decay: CF(t) = CF₀ × e^(-kt)
        initial_confidence REAL DEFAULT 0.5,
        decay_constant REAL DEFAULT 0.01,
        last_validated INTEGER,

        -- Application tracking
        times_applied INTEGER DEFAULT 0,
        times_succeeded INTEGER DEFAULT 0,

        created_at INTEGER,
        deprecated_at INTEGER,

        FOREIGN KEY (pattern_id) REFERENCES patterns(id)
      )
    `);

    // Lessons indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_lessons_pattern ON lessons(pattern_id);
      CREATE INDEX IF NOT EXISTS idx_lessons_validated ON lessons(last_validated);
      CREATE INDEX IF NOT EXISTS idx_lessons_deprecated ON lessons(deprecated_at);
    `);
  }

  // ==========================================================================
  // Episode CRUD Operations
  // ==========================================================================

  /**
   * Insert a new episode with utility scoring
   */
  insertEpisode(episode: Omit<Episode, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO episodes (
        timestamp, operation_type, server_name,
        problem, solution, outcome, metadata,
        quality_score, duration_ms, notes,
        novelty_score, effectiveness_score, generalizability_score, utility_score,
        client_domain, problem_category, vertical, company_size
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    const result = stmt.run(
      episode.timestamp,
      episode.operation_type,
      episode.server_name || null,
      episode.problem ? JSON.stringify(episode.problem) : null,
      episode.solution ? JSON.stringify(episode.solution) : null,
      episode.outcome,
      episode.metadata ? JSON.stringify(episode.metadata) : null,
      episode.quality_score ?? null,
      episode.duration_ms ?? null,
      episode.notes ?? null,
      episode.novelty_score,
      episode.effectiveness_score,
      episode.generalizability_score,
      episode.utility_score,
      episode.client_domain ?? null,
      episode.problem_category ?? null,
      episode.vertical ?? null,
      episode.company_size ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get episode by ID
   */
  getEpisode(id: number): Episode | null {
    const stmt = this.db.prepare('SELECT * FROM episodes WHERE id = ?');
    const row = stmt.get(id) as EpisodeRow | undefined;
    return row ? this.rowToEpisode(row) : null;
  }

  /**
   * Get episodes by operation type
   */
  getEpisodesByType(
    operationType: string,
    since?: number,
    limit: number = 100
  ): Episode[] {
    let sql = 'SELECT * FROM episodes WHERE operation_type = ?';
    const params: (string | number)[] = [operationType];

    if (since !== undefined) {
      sql += ' AND timestamp >= ?';
      params.push(since);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as EpisodeRow[];
    return rows.map(row => this.rowToEpisode(row));
  }

  /**
   * Get episodes by outcome
   */
  getEpisodesByOutcome(
    outcome: 'success' | 'failure' | 'partial',
    operationType?: string,
    limit: number = 100
  ): Episode[] {
    let sql = 'SELECT * FROM episodes WHERE outcome = ?';
    const params: (string | number)[] = [outcome];

    if (operationType) {
      sql += ' AND operation_type = ?';
      params.push(operationType);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as EpisodeRow[];
    return rows.map(row => this.rowToEpisode(row));
  }

  /**
   * Get recent episodes
   */
  getRecentEpisodes(limit: number = 50): Episode[] {
    const stmt = this.db.prepare(`
      SELECT * FROM episodes
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as EpisodeRow[];
    return rows.map(row => this.rowToEpisode(row));
  }

  /**
   * Get episodes by IDs
   */
  getEpisodesByIds(ids: number[]): Episode[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT * FROM episodes WHERE id IN (${placeholders})
    `);
    const rows = stmt.all(...ids) as EpisodeRow[];
    return rows.map(row => this.rowToEpisode(row));
  }

  /**
   * Get episode count
   */
  getEpisodeCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM episodes');
    const row = stmt.get() as { count: number };
    return row.count;
  }

  /**
   * Get average utility score
   */
  getAverageUtility(operationType?: string): number {
    let sql = 'SELECT AVG(utility_score) as avg FROM episodes';
    const params: string[] = [];

    if (operationType) {
      sql += ' WHERE operation_type = ?';
      params.push(operationType);
    }

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as { avg: number | null };
    return row.avg ?? 0;
  }

  // ==========================================================================
  // Pattern CRUD Operations
  // ==========================================================================

  /**
   * Insert a new pattern
   */
  insertPattern(pattern: Omit<Pattern, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO patterns (
        pattern_type, description, episode_ids,
        frequency, last_seen, created_at,
        initial_confidence, decay_constant, last_validated,
        times_applied, times_succeeded, discrimination_weight
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      pattern.pattern_type,
      pattern.description,
      JSON.stringify(pattern.episode_ids),
      pattern.frequency,
      pattern.last_seen,
      pattern.created_at,
      pattern.initial_confidence,
      pattern.decay_constant,
      pattern.last_validated,
      pattern.times_applied,
      pattern.times_succeeded,
      pattern.discrimination_weight
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: number): Pattern | null {
    const stmt = this.db.prepare('SELECT * FROM patterns WHERE id = ?');
    const row = stmt.get(id) as PatternRow | undefined;
    return row ? this.rowToPattern(row) : null;
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(patternType: 'success' | 'failure' | 'correlation'): Pattern[] {
    const stmt = this.db.prepare(`
      SELECT * FROM patterns
      WHERE pattern_type = ?
      ORDER BY discrimination_weight DESC
    `);
    const rows = stmt.all(patternType) as PatternRow[];
    return rows.map(row => this.rowToPattern(row));
  }

  /**
   * Find pattern by description containing text
   */
  findPatternByDescription(searchText: string): Pattern | null {
    const stmt = this.db.prepare(`
      SELECT * FROM patterns
      WHERE description LIKE ?
      LIMIT 1
    `);
    const row = stmt.get(`%${searchText}%`) as PatternRow | undefined;
    return row ? this.rowToPattern(row) : null;
  }

  /**
   * Get all patterns ordered by discrimination weight
   */
  getAllPatterns(): Pattern[] {
    const stmt = this.db.prepare(`
      SELECT * FROM patterns
      ORDER BY discrimination_weight DESC
    `);
    const rows = stmt.all() as PatternRow[];
    return rows.map(row => this.rowToPattern(row));
  }

  /**
   * Update pattern
   */
  updatePattern(id: number, updates: Partial<Pattern>): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.frequency !== undefined) {
      fields.push('frequency = ?');
      values.push(updates.frequency);
    }
    if (updates.last_seen !== undefined) {
      fields.push('last_seen = ?');
      values.push(updates.last_seen);
    }
    if (updates.initial_confidence !== undefined) {
      fields.push('initial_confidence = ?');
      values.push(updates.initial_confidence);
    }
    if (updates.last_validated !== undefined) {
      fields.push('last_validated = ?');
      values.push(updates.last_validated);
    }
    if (updates.times_applied !== undefined) {
      fields.push('times_applied = ?');
      values.push(updates.times_applied);
    }
    if (updates.times_succeeded !== undefined) {
      fields.push('times_succeeded = ?');
      values.push(updates.times_succeeded);
    }
    if (updates.discrimination_weight !== undefined) {
      fields.push('discrimination_weight = ?');
      values.push(updates.discrimination_weight);
    }
    if (updates.episode_ids !== undefined) {
      fields.push('episode_ids = ?');
      values.push(JSON.stringify(updates.episode_ids));
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE patterns SET ${fields.join(', ')} WHERE id = ?
    `);
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * Get pattern count
   */
  getPatternCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM patterns');
    const row = stmt.get() as { count: number };
    return row.count;
  }

  // ==========================================================================
  // Lesson CRUD Operations
  // ==========================================================================

  /**
   * Insert a new lesson
   */
  insertLesson(lesson: Omit<Lesson, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO lessons (
        statement, pattern_id, contexts,
        initial_confidence, decay_constant, last_validated,
        times_applied, times_succeeded,
        created_at, deprecated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      lesson.statement,
      lesson.pattern_id ?? null,
      lesson.contexts ? JSON.stringify(lesson.contexts) : null,
      lesson.initial_confidence,
      lesson.decay_constant,
      lesson.last_validated,
      lesson.times_applied,
      lesson.times_succeeded,
      lesson.created_at,
      lesson.deprecated_at ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get lesson by ID
   */
  getLesson(id: number): Lesson | null {
    const stmt = this.db.prepare('SELECT * FROM lessons WHERE id = ?');
    const row = stmt.get(id) as LessonRow | undefined;
    return row ? this.rowToLesson(row) : null;
  }

  /**
   * Get active lessons (not deprecated) with current confidence
   */
  getActiveLessons(minConfidence: number = 0): Array<Lesson & { current_confidence: number }> {
    const stmt = this.db.prepare(`
      SELECT * FROM lessons
      WHERE deprecated_at IS NULL
      ORDER BY initial_confidence DESC
    `);
    const rows = stmt.all() as LessonRow[];

    return rows
      .map(row => {
        const lesson = this.rowToLesson(row);
        const currentConfidence = calculateCurrentConfidence(
          lesson.initial_confidence,
          lesson.decay_constant,
          lesson.last_validated
        );
        return { ...lesson, current_confidence: currentConfidence };
      })
      .filter(lesson => lesson.current_confidence >= minConfidence);
  }

  /**
   * Get lessons by pattern ID
   */
  getLessonsByPattern(patternId: number): Lesson[] {
    const stmt = this.db.prepare(`
      SELECT * FROM lessons
      WHERE pattern_id = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(patternId) as LessonRow[];
    return rows.map(row => this.rowToLesson(row));
  }

  /**
   * Update lesson
   */
  updateLesson(id: number, updates: Partial<Lesson>): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.initial_confidence !== undefined) {
      fields.push('initial_confidence = ?');
      values.push(updates.initial_confidence);
    }
    if (updates.last_validated !== undefined) {
      fields.push('last_validated = ?');
      values.push(updates.last_validated);
    }
    if (updates.times_applied !== undefined) {
      fields.push('times_applied = ?');
      values.push(updates.times_applied);
    }
    if (updates.times_succeeded !== undefined) {
      fields.push('times_succeeded = ?');
      values.push(updates.times_succeeded);
    }
    if (updates.deprecated_at !== undefined) {
      fields.push('deprecated_at = ?');
      values.push(updates.deprecated_at);
    }
    if (updates.contexts !== undefined) {
      fields.push('contexts = ?');
      values.push(JSON.stringify(updates.contexts));
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE lessons SET ${fields.join(', ')} WHERE id = ?
    `);
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * Deprecate lesson (mark as no longer reliable)
   */
  deprecateLesson(id: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE lessons SET deprecated_at = ? WHERE id = ?
    `);
    const result = stmt.run(Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Get lesson count
   */
  getLessonCount(includeDeprecated: boolean = false): number {
    let sql = 'SELECT COUNT(*) as count FROM lessons';
    if (!includeDeprecated) {
      sql += ' WHERE deprecated_at IS NULL';
    }
    const stmt = this.db.prepare(sql);
    const row = stmt.get() as { count: number };
    return row.count;
  }

  // ==========================================================================
  // Row Conversion Helpers
  // ==========================================================================

  private rowToEpisode(row: EpisodeRow): Episode {
    return {
      id: row.id,
      timestamp: row.timestamp,
      operation_type: row.operation_type,
      server_name: row.server_name ?? undefined,
      problem: row.problem ? JSON.parse(row.problem) as ProblemContext : undefined,
      solution: row.solution ? JSON.parse(row.solution) as SolutionContext : undefined,
      outcome: row.outcome as 'success' | 'failure' | 'partial',
      metadata: row.metadata ? JSON.parse(row.metadata) as EpisodeMetadata : undefined,
      quality_score: row.quality_score ?? undefined,
      duration_ms: row.duration_ms ?? undefined,
      notes: row.notes ?? undefined,
      novelty_score: row.novelty_score,
      effectiveness_score: row.effectiveness_score,
      generalizability_score: row.generalizability_score,
      utility_score: row.utility_score,
      client_domain: row.client_domain ?? undefined,
      problem_category: row.problem_category ?? undefined,
      vertical: row.vertical ?? undefined,
      company_size: row.company_size ?? undefined
    };
  }

  private rowToPattern(row: PatternRow): Pattern {
    return {
      id: row.id,
      pattern_type: row.pattern_type as 'success' | 'failure' | 'correlation',
      description: row.description,
      episode_ids: JSON.parse(row.episode_ids) as number[],
      frequency: row.frequency,
      last_seen: row.last_seen,
      created_at: row.created_at,
      initial_confidence: row.initial_confidence,
      decay_constant: row.decay_constant,
      last_validated: row.last_validated,
      times_applied: row.times_applied,
      times_succeeded: row.times_succeeded,
      discrimination_weight: row.discrimination_weight
    };
  }

  private rowToLesson(row: LessonRow): Lesson {
    return {
      id: row.id,
      statement: row.statement,
      pattern_id: row.pattern_id ?? undefined,
      contexts: row.contexts ? JSON.parse(row.contexts) as string[] : undefined,
      initial_confidence: row.initial_confidence,
      decay_constant: row.decay_constant,
      last_validated: row.last_validated,
      times_applied: row.times_applied,
      times_succeeded: row.times_succeeded,
      created_at: row.created_at,
      deprecated_at: row.deprecated_at ?? undefined
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get database statistics
   */
  getStats(): {
    episodes: number;
    patterns: number;
    lessons: number;
    avgUtility: number;
    highConfidenceLessons: number;
  } {
    const activeLessons = this.getActiveLessons();
    const highConfidence = activeLessons.filter(l => l.current_confidence >= 0.7);

    return {
      episodes: this.getEpisodeCount(),
      patterns: this.getPatternCount(),
      lessons: this.getLessonCount(),
      avgUtility: this.getAverageUtility(),
      highConfidenceLessons: highConfidence.length
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get raw database instance (for testing)
   */
  getRawDb(): Database.Database {
    return this.db;
  }
}

// Singleton instance
let dbInstance: DatabaseManager | null = null;

export function getDatabase(dbPath?: string): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager(dbPath);
  }
  return dbInstance;
}

export function setDatabase(db: DatabaseManager): void {
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = db;
}

export function resetDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
