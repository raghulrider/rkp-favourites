/**
 * Main Addon Entry Point
 * Sets up the Stremio addon builder and registers handlers
 */

const { addonBuilder } = require('stremio-addon-sdk');
const catalogService = require('./services/catalogService');
const { generateManifest } = require('./config/manifest');
const { handleCatalogRequest } = require('./controllers/catalogController');
const logger = require('./utils/logger');
const addonConfig = require('./config/addonConfig');

/**
 * Initialize and build the addon
 * @param {Object} config - Optional configuration object to override defaults
 * @returns {Object} Stremio addon interface
 */
function buildAddon(config = {}) {
  try {
    // Use provided config or fall back to addonConfig
    const catalogDataPath = config.catalogDataPath || addonConfig.catalogDataPath;
    catalogService.loadCatalogData(catalogDataPath);

    // Generate manifest - use provided config or fall back to addonConfig
    const manifestConfig = {
      addonId: config.addonId || addonConfig.addonId,
      addonVersion: config.addonVersion || addonConfig.addonVersion,
      addonName: config.addonName || addonConfig.addonName,
      addonDescription: config.addonDescription || addonConfig.addonDescription,
      addonLogo: config.addonLogo || addonConfig.addonLogo,
      addonBackground: config.addonBackground || addonConfig.addonBackground,
      idPrefixes: config.idPrefixes || addonConfig.idPrefixes,
    };

    const manifest = generateManifest(manifestConfig);

    // Create addon builder instance
    const builder = new addonBuilder(manifest);

    // Register catalog handler
    builder.defineCatalogHandler(handleCatalogRequest);

    logger.info('Addon built successfully');
    logger.info(`Addon ID: ${manifest.id}`);
    logger.info(`Addon Name: ${manifest.name}`);
    logger.info(`Supported Types: ${manifest.types.join(', ')}`);
    logger.info(`Total Catalogs: ${manifest.catalogs.length}`);

    // Return the addon interface
    return builder.getInterface();
  } catch (error) {
    logger.error('Failed to build addon:', error.message || error.toString() || String(error));
    throw error;
  }
}

module.exports = buildAddon;

