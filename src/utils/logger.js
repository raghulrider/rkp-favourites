/**
 * Simple logger utility for the addon
 * In production, consider using winston or pino for more advanced logging
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLogLevel = process.env.LOG_LEVEL || 'info';
const logLevelValue = LOG_LEVELS[currentLogLevel.toUpperCase()] ?? LOG_LEVELS.INFO;

const logger = {
  error: (...args) => {
    if (logLevelValue >= LOG_LEVELS.ERROR) {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    }
  },
  warn: (...args) => {
    if (logLevelValue >= LOG_LEVELS.WARN) {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    }
  },
  info: (...args) => {
    if (logLevelValue >= LOG_LEVELS.INFO) {
      console.log('[INFO]', new Date().toISOString(), ...args);
    }
  },
  debug: (...args) => {
    if (logLevelValue >= LOG_LEVELS.DEBUG) {
      console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
  },
};

module.exports = logger;

