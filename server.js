/**
 * HTTP Server Entry Point
 * Serves the Stremio addon via HTTP
 */

const { serveHTTP } = require('stremio-addon-sdk');
const buildAddon = require('./src/index');
const logger = require('./src/utils/logger');
const addonConfig = require('./src/config/addonConfig');

// Get port from environment variable (required for PaaS compatibility)
// Most hosting platforms (Heroku, Railway, Render, etc.) set PORT environment variable dynamically
const PORT = process.env.PORT || addonConfig.port;

try {
  // Build the addon
  const addonInterface = buildAddon();

  // Start HTTP server
  serveHTTP(addonInterface, { port: PORT }, (err, url) => {
    if (err) {
      logger.error('Failed to start server:', err.message);
      process.exit(1);
    }

    logger.info(`Stremio addon server running on port ${PORT}`);
    logger.info(`Addon manifest available at: ${url}/manifest.json`);
    logger.info(`Add this URL to Stremio: ${url}/manifest.json`);
  });
} catch (error) {
  logger.error('Failed to initialize addon:', error.message);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

