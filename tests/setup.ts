/**
 * Jest setup file for experience-layer tests
 */

import { afterAll, beforeAll, jest } from '@jest/globals';

// Increase timeout for database operations
jest.setTimeout(10000);

// Global setup
beforeAll(() => {
  // Suppress console output during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  }
});

// Global teardown
afterAll(() => {
  jest.restoreAllMocks();
});
