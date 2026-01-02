/**
 * Manifest Configuration
 * Dynamically generates Stremio addon manifest from catalog_data.json
 */

const catalogService = require('../services/catalogService');
const logger = require('../utils/logger');
const { DataLoadError } = require('../utils/errors');

/**
 * Format catalog name for display
 * Converts "best_movies_of_2025" to "Best Movies of 2025"
 * @param {string} catalogName - Catalog name from JSON
 * @returns {string} Formatted name
 */
function formatCatalogName(catalogName) {
  if (!catalogName) {
    return 'Unknown Catalog';
  }

  return catalogName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate manifest object
 * @param {Object} config - Addon configuration
 * @returns {Object} Stremio manifest object
 */
function generateManifest(config) {
  try {
    // Get all catalogs and supported types from the service
    const catalogs = catalogService.getAllCatalogs();
    const supportedTypes = catalogService.getSupportedTypes();

    // Build catalogs array for manifest
    // Include 'skip' in extra to enable pagination support
    // Include 'genre' in extra with dynamic options for each catalog
    const manifestCatalogs = catalogs.map((catalog) => {
      const extra = [
        {
          name: 'skip',
          isRequired: false,
        },
      ];

      // Get unique genres for this catalog
      // try {
      //   const genres = catalogService.getCatalogGenres(
      //     catalog.catalog_type,
      //     catalog.catalog_name
      //   );

      //   // Only add genre filter if there are genres available
      //   if (genres.length > 0) {
      //     extra.push({
      //       name: 'genre',
      //       isRequired: false,
      //       options: genres,
      //     });
      //   }
      // } catch (error) {
      //   logger.warn(
      //     `Failed to get genres for catalog ${catalog.catalog_type}/${catalog.catalog_name}: ${error.message}`
      //   );
      //   // Continue without genre filter if there's an error
      // }

      return {
        type: catalog.catalog_type,
        id: catalog.catalog_name,
        name: formatCatalogName(catalog.catalog_name),
        extra,
      };
    });

    // Validate required config
    if (!config.addonId) {
      throw new Error('addonId is required in manifest configuration');
    }
    if (!config.addonVersion) {
      throw new Error('addonVersion is required in manifest configuration');
    }
    if (!config.addonName) {
      throw new Error('addonName is required in manifest configuration');
    }
    if (!config.addonDescription) {
      throw new Error('addonDescription is required in manifest configuration');
    }
    if (!config.idPrefixes || !Array.isArray(config.idPrefixes)) {
      throw new Error('idPrefixes array is required in manifest configuration');
    }

    // Build manifest
    const manifest = {
      id: config.addonId,
      version: config.addonVersion,
      name: config.addonName,
      description: config.addonDescription,
      resources: ['catalog'],
      types: supportedTypes,
      catalogs: manifestCatalogs,
      idPrefixes: config.idPrefixes,
    };

    // Add logo if provided
    if (config.addonLogo) {
      manifest.logo = config.addonLogo;
    }

    // Add background if provided
    if (config.addonBackground) {
      manifest.background = config.addonBackground;
    }

    // TODO: Future enhancement - addonCatalogs
    // The addonCatalogs field allows your addon to act as a catalog of other addons,
    // facilitating the discovery of additional content sources.
    // Format: manifest.addonCatalogs = [{ type: 'addon', id: '...', name: '...' }]
    // This would require additional configuration and logic to manage other addon manifests.

    // TODO: Future enhancement - config and behaviorHints
    // These fields enable user-configurable settings for your addon.
    // behaviorHints: { configurable: true, configurationRequired: false }
    // config: [{ key: 'settingKey', type: 'text|number|password|checkbox|select', title: '...', default: '...', options: [...] }]
    // When configurable is true, Stremio will show a configuration UI where users can set values.
    // These config values are then passed to your handlers: handler({ type, id, config })
    // Useful for: API keys, language preferences, content filters, quality settings, etc.

    logger.info(`Generated manifest with ${manifestCatalogs.length} catalogs and types: ${supportedTypes.join(', ')}`);
    
    return manifest;
  } catch (error) {
    logger.error('Failed to generate manifest:', error.message);
    throw new DataLoadError(`Manifest generation failed: ${error.message}`, error);
  }
}

module.exports = {
  generateManifest,
  formatCatalogName,
};

