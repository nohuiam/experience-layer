/**
 * InterLock Tests for Experience Layer
 * Tests protocol encoding/decoding, tumbler filtering, and signal handling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  encodeSignal,
  decodeSignal,
  createSignal,
  getSignalName,
  getSignalCode
} from '../src/interlock/protocol.js';
import {
  isSignalAllowed,
  addToWhitelist,
  removeFromWhitelist,
  getWhitelist,
  loadTumblerConfig
} from '../src/interlock/tumbler.js';
import { registerHandler, handleSignal, handlers } from '../src/interlock/handlers.js';
import { Signal, SignalTypes } from '../src/types.js';
import { DatabaseManager, resetDatabase, getDatabase, setDatabase } from '../src/database/schema.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

describe('InterLock Protocol', () => {
  describe('Signal Encoding/Decoding', () => {
    it('should encode and decode a basic signal', () => {
      const signal: Signal = {
        code: 0xB0,
        name: 'BUILD_COMPLETED',
        sender: 'neurogenesis',
        timestamp: Date.now()
      };

      const encoded = encodeSignal(signal);
      expect(encoded).toBeInstanceOf(Buffer);

      const decoded = decodeSignal(encoded);
      expect(decoded.code).toBe(signal.code);
      expect(decoded.name).toBe(signal.name);
      expect(decoded.sender).toBe(signal.sender);
      expect(decoded.timestamp).toBe(signal.timestamp);
    });

    it('should encode and decode signal with data payload', () => {
      const signal: Signal = {
        code: 0xD0,
        name: 'VERIFICATION_RESULT',
        sender: 'verifier',
        timestamp: Date.now(),
        data: {
          claim: 'Test claim',
          verified: true,
          confidence: 0.95
        }
      };

      const encoded = encodeSignal(signal);
      const decoded = decodeSignal(encoded);

      expect(decoded.data).toEqual(signal.data);
    });

    it('should handle empty sender', () => {
      const signal: Signal = {
        code: 0x00,
        name: 'HEARTBEAT',
        sender: '',
        timestamp: Date.now()
      };

      const encoded = encodeSignal(signal);
      const decoded = decodeSignal(encoded);

      expect(decoded.sender).toBe('');
    });

    it('should handle long sender name', () => {
      const signal: Signal = {
        code: 0xFF,
        name: 'OPERATION_COMPLETE',
        sender: 'a'.repeat(200),
        timestamp: Date.now()
      };

      const encoded = encodeSignal(signal);
      const decoded = decodeSignal(encoded);

      expect(decoded.sender).toBe('a'.repeat(200));
    });

    it('should handle complex nested data', () => {
      const signal: Signal = {
        code: 0xF0,
        name: 'EXPERIENCE_RECORDED',
        sender: 'experience-layer',
        timestamp: Date.now(),
        data: {
          episode: {
            id: 123,
            problem: { query: 'test', constraints: { nested: true } }
          },
          patterns: [1, 2, 3],
          meta: null
        }
      };

      const encoded = encodeSignal(signal);
      const decoded = decodeSignal(encoded);

      expect(decoded.data).toEqual(signal.data);
    });
  });

  describe('Signal Names and Codes', () => {
    it('should get signal name from code', () => {
      expect(getSignalName(0xB0)).toBe('BUILD_COMPLETED');
      expect(getSignalName(0xD0)).toBe('VERIFICATION_RESULT');
      expect(getSignalName(0xF0)).toBe('EXPERIENCE_RECORDED');
      expect(getSignalName(0x00)).toBe('HEARTBEAT');
    });

    it('should return UNKNOWN for invalid codes', () => {
      expect(getSignalName(0xAA)).toContain('UNKNOWN');
    });

    it('should get signal code from name', () => {
      expect(getSignalCode('BUILD_COMPLETED')).toBe(0xB0);
      expect(getSignalCode('HEARTBEAT')).toBe(0x00);
    });

    it('should return undefined for invalid names', () => {
      expect(getSignalCode('INVALID_SIGNAL')).toBeUndefined();
    });
  });

  describe('createSignal', () => {
    it('should create a signal with timestamp', () => {
      const before = Date.now();
      const signal = createSignal(0xF0, 'experience-layer', { test: true });
      const after = Date.now();

      expect(signal.code).toBe(0xF0);
      expect(signal.name).toBe('EXPERIENCE_RECORDED');
      expect(signal.sender).toBe('experience-layer');
      expect(signal.timestamp).toBeGreaterThanOrEqual(before);
      expect(signal.timestamp).toBeLessThanOrEqual(after);
      expect(signal.data).toEqual({ test: true });
    });
  });
});

describe('InterLock Tumbler', () => {
  beforeEach(() => {
    loadTumblerConfig();
  });

  describe('Whitelist Filtering', () => {
    it('should allow whitelisted signals', () => {
      addToWhitelist('TEST_SIGNAL');

      const signal: Signal = {
        code: 0x99,
        name: 'TEST_SIGNAL',
        sender: 'test',
        timestamp: Date.now()
      };

      expect(isSignalAllowed(signal)).toBe(true);

      removeFromWhitelist('TEST_SIGNAL');
    });

    it('should block non-whitelisted signals', () => {
      const signal: Signal = {
        code: 0x99,
        name: 'BLOCKED_SIGNAL',
        sender: 'test',
        timestamp: Date.now()
      };

      expect(isSignalAllowed(signal)).toBe(false);
    });

    it('should add and remove from whitelist', () => {
      const initialWhitelist = getWhitelist();
      const hadTest = initialWhitelist.includes('ADD_REMOVE_TEST');

      addToWhitelist('ADD_REMOVE_TEST');
      expect(getWhitelist()).toContain('ADD_REMOVE_TEST');

      removeFromWhitelist('ADD_REMOVE_TEST');
      expect(getWhitelist().includes('ADD_REMOVE_TEST')).toBe(hadTest);
    });

    it('should not duplicate whitelist entries', () => {
      addToWhitelist('DUPLICATE_TEST');
      addToWhitelist('DUPLICATE_TEST');

      const whitelist = getWhitelist();
      const count = whitelist.filter(s => s === 'DUPLICATE_TEST').length;
      expect(count).toBe(1);

      removeFromWhitelist('DUPLICATE_TEST');
    });
  });
});

describe('InterLock Handlers', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    resetDatabase();
    testDir = join(tmpdir(), `experience-interlock-test-${randomUUID()}`);
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

  describe('registerHandler', () => {
    it('should register and call custom handler', () => {
      let called = false;
      let receivedSignal: Signal | null = null;

      registerHandler(0x99, (signal) => {
        called = true;
        receivedSignal = signal;
      });

      const signal = createSignal(0x99, 'test');
      handleSignal(signal);

      expect(called).toBe(true);
      expect(receivedSignal).not.toBeNull();
      expect(receivedSignal!.sender).toBe('test');
    });

    it('should override existing handler', () => {
      let count = 0;

      registerHandler(0x98, () => { count += 1; });
      registerHandler(0x98, () => { count += 10; });

      handleSignal(createSignal(0x98, 'test'));

      expect(count).toBe(10);
    });
  });

  describe('Built-in Handlers', () => {
    it('should handle BUILD_COMPLETED', () => {
      const signal = createSignal(SignalTypes.BUILD_COMPLETED, 'neurogenesis', {
        success: true,
        duration_ms: 5000
      });

      // This should record an episode
      handleSignal(signal);

      const db = getDatabase();
      const episodes = db.getEpisodesByType('build');
      expect(episodes.length).toBeGreaterThan(0);
    });

    it('should handle VERIFICATION_RESULT', () => {
      const signal = createSignal(SignalTypes.VERIFICATION_RESULT, 'verifier', {
        claim: 'Test claim',
        verified: true,
        confidence: 0.9
      });

      handleSignal(signal);

      const db = getDatabase();
      const episodes = db.getEpisodesByType('verification');
      expect(episodes.length).toBeGreaterThan(0);
    });

    it('should handle VALIDATION_APPROVED', () => {
      const signal = createSignal(SignalTypes.VALIDATION_APPROVED, 'context-guardian', {
        context: { type: 'test' }
      });

      handleSignal(signal);

      const db = getDatabase();
      const episodes = db.getEpisodesByType('validation');
      const successes = episodes.filter(e => e.outcome === 'success');
      expect(successes.length).toBeGreaterThan(0);
    });

    it('should handle VALIDATION_REJECTED', () => {
      const signal = createSignal(SignalTypes.VALIDATION_REJECTED, 'context-guardian', {
        reason: 'Invalid context'
      });

      handleSignal(signal);

      const db = getDatabase();
      const episodes = db.getEpisodesByType('validation');
      const failures = episodes.filter(e => e.outcome === 'failure');
      expect(failures.length).toBeGreaterThan(0);
    });

    it('should handle OPERATION_COMPLETE', () => {
      const signal = createSignal(SignalTypes.OPERATION_COMPLETE, 'test-server', {
        operation_type: 'custom_op',
        outcome: 'success'
      });

      handleSignal(signal);

      const db = getDatabase();
      const episodes = db.getEpisodesByType('custom_op');
      expect(episodes.length).toBeGreaterThan(0);
    });

    it('should handle LESSON_LEARNED', () => {
      const signal = createSignal(SignalTypes.LESSON_LEARNED, 'consciousness', {
        statement: 'Test lesson from consciousness',
        confidence: 0.75
      });

      handleSignal(signal);

      const db = getDatabase();
      const lessons = db.getActiveLessons();
      const found = lessons.find(l => l.statement === 'Test lesson from consciousness');
      expect(found).toBeDefined();
    });

    it('should handle CLAIM_VERIFIED and increase confidence', () => {
      const db = getDatabase();
      const lessonId = db.insertLesson({
        statement: 'Test lesson',
        initial_confidence: 0.5,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      const signal = createSignal(SignalTypes.CLAIM_VERIFIED, 'verifier', {
        lesson_id: lessonId
      });

      handleSignal(signal);

      const lesson = db.getLesson(lessonId);
      expect(lesson!.initial_confidence).toBeGreaterThan(0.5);
    });

    it('should handle CLAIM_REFUTED and decrease confidence', () => {
      const db = getDatabase();
      const lessonId = db.insertLesson({
        statement: 'Test lesson',
        initial_confidence: 0.8,
        decay_constant: 0.01,
        last_validated: Date.now(),
        times_applied: 0,
        times_succeeded: 0,
        created_at: Date.now()
      });

      const signal = createSignal(SignalTypes.CLAIM_REFUTED, 'verifier', {
        lesson_id: lessonId
      });

      handleSignal(signal);

      const lesson = db.getLesson(lessonId);
      expect(lesson!.initial_confidence).toBeLessThan(0.8);
    });

    it('should handle HEARTBEAT without error', () => {
      const signal = createSignal(SignalTypes.HEARTBEAT, 'consciousness');

      expect(() => {
        handleSignal(signal);
      }).not.toThrow();
    });
  });

  describe('Handler Error Handling', () => {
    it('should not throw on unknown signal code', () => {
      const signal = createSignal(0xAB, 'unknown');

      expect(() => {
        handleSignal(signal);
      }).not.toThrow();
    });

    it('should handle handler errors gracefully', () => {
      registerHandler(0x97, () => {
        throw new Error('Test error');
      });

      expect(() => {
        handleSignal(createSignal(0x97, 'test'));
      }).not.toThrow();
    });
  });
});
