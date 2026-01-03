/**
 * InterLock Module Exports
 * Mesh communication for Experience Layer
 */

export {
  startInterlock,
  sendToPeer,
  broadcastSignal,
  emitExperienceRecorded,
  emitPatternEmerged,
  emitLessonExtracted,
  emitLessonValidated,
  getSocket,
  closeInterlock,
  getPeers
} from './socket.js';

export {
  encodeSignal,
  decodeSignal,
  createSignal,
  getSignalName,
  getSignalCode
} from './protocol.js';

export {
  registerHandler,
  handleSignal,
  handlers
} from './handlers.js';

export {
  loadTumblerConfig,
  isSignalAllowed,
  filterSignals,
  addToWhitelist,
  removeFromWhitelist,
  getWhitelist,
  getTumblerConfig
} from './tumbler.js';
