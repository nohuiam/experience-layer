/**
 * InterLock Tumbler - Signal Whitelist Filtering
 * Only allows configured signals through
 */

import { Signal } from '../types.js';
import { getSignalName } from './protocol.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TumblerConfig {
  mode: 'whitelist' | 'blacklist';
  whitelist?: string[];
  blacklist?: string[];
}

let config: TumblerConfig = {
  mode: 'whitelist',
  whitelist: []
};

/**
 * Load tumbler configuration from interlock.json
 */
export function loadTumblerConfig(): TumblerConfig {
  try {
    const configPath = join(__dirname, '../../config/interlock.json');
    const rawConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    config = rawConfig.tumbler || config;
  } catch (error) {
    console.warn('Could not load tumbler config, using defaults:', error);
  }
  return config;
}

/**
 * Check if a signal is allowed through the tumbler
 */
export function isSignalAllowed(signal: Signal): boolean {
  const signalName = getSignalName(signal.signalType);
  if (config.mode === 'whitelist') {
    return config.whitelist?.includes(signalName) ?? false;
  } else if (config.mode === 'blacklist') {
    return !(config.blacklist?.includes(signalName) ?? false);
  }
  return true;
}

/**
 * Filter an array of signals through the tumbler
 */
export function filterSignals(signals: Signal[]): Signal[] {
  return signals.filter(isSignalAllowed);
}

/**
 * Add a signal to the whitelist
 */
export function addToWhitelist(signalName: string): void {
  if (!config.whitelist) {
    config.whitelist = [];
  }
  if (!config.whitelist.includes(signalName)) {
    config.whitelist.push(signalName);
  }
}

/**
 * Remove a signal from the whitelist
 */
export function removeFromWhitelist(signalName: string): void {
  if (config.whitelist) {
    const index = config.whitelist.indexOf(signalName);
    if (index > -1) {
      config.whitelist.splice(index, 1);
    }
  }
}

/**
 * Get current whitelist
 */
export function getWhitelist(): string[] {
  return config.whitelist ?? [];
}

/**
 * Get tumbler config
 */
export function getTumblerConfig(): TumblerConfig {
  return config;
}

// Load config on module initialization
loadTumblerConfig();
