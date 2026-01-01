/**
 * Catalog Service
 * Handles loading and serving catalog data from catalog_data.json
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { DataLoadError, CatalogNotFoundError } = require('../utils/errors');

class CatalogService {
  constructor() {
    this.catalogData = null;
    this.catalogMap = new Map(); // Map for quick lookup: "type:id" -> catalog
    this.initialized = false;
    this.dataPath = null;
    this.fileWatcher = null;
  }

  /**
   * Load catalog data from JSON file
   * @param {string} dataPath - Path to catalog_data.json
   * @param {boolean} watchForChanges - Whether to watch for file changes (default: true)
   */
  loadCatalogData(dataPath, watchForChanges = true) {
    try {
      const absolutePath = path.resolve(dataPath);
      this.dataPath = absolutePath;
      
      logger.info(`Loading catalog data from: ${absolutePath}`);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Catalog data file not found: ${absolutePath}`);
      }

      this._reloadCatalogData();

      // Set up file watcher if requested
      if (watchForChanges) {
        this._setupFileWatcher(absolutePath);
      }

      return true;
    } catch (error) {
      logger.error('Failed to load catalog data:', error.message);
      throw new DataLoadError(error.message, error);
    }
  }

  /**
   * Reload catalog data from file
   * @private
   */
  _reloadCatalogData() {
    try {
      if (!this.dataPath || !fs.existsSync(this.dataPath)) {
        throw new Error(`Catalog data file not found: ${this.dataPath}`);
      }

      const fileContent = fs.readFileSync(this.dataPath, 'utf8');
      const data = JSON.parse(fileContent);

      if (!data || !Array.isArray(data.catalogs)) {
        throw new Error('Invalid catalog data format: expected { catalogs: [...] }');
      }

      this.catalogData = data;
      this._buildCatalogMap();
      this.initialized = true;

      logger.info(`Successfully loaded ${data.catalogs.length} catalogs`);
    } catch (error) {
      logger.error('Failed to reload catalog data:', error.message);
      // Don't throw - keep using old data if reload fails
      if (!this.initialized) {
        throw new DataLoadError(error.message, error);
      }
    }
  }

  /**
   * Set up file watcher for automatic reloading
   * @private
   */
  _setupFileWatcher(filePath) {
    // Stop existing watcher if any
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    try {
      // Watch for file changes
      this.fileWatcher = fs.watch(filePath, { persistent: true }, (eventType, filename) => {
        if (eventType === 'change' && filename) {
          logger.info(`Catalog data file changed (${filename}), reloading...`);
          
          // Debounce: wait a bit before reloading to avoid multiple rapid reloads
          if (this._reloadTimeout) {
            clearTimeout(this._reloadTimeout);
          }
          
          this._reloadTimeout = setTimeout(() => {
            this._reloadCatalogData();
            logger.info('Catalog data reloaded successfully');
          }, 1000); // Wait 1 second after last change
        }
      });

      logger.info(`File watcher set up for: ${filePath}`);
    } catch (error) {
      logger.warn(`Failed to set up file watcher: ${error.message}`);
      logger.warn('Catalog data will not auto-reload. Restart the server to load changes.');
    }
  }

  /**
   * Stop file watcher
   */
  stopWatching() {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
      logger.info('File watcher stopped');
    }
    if (this._reloadTimeout) {
      clearTimeout(this._reloadTimeout);
      this._reloadTimeout = null;
    }
  }

  /**
   * Build a map for quick catalog lookup
   * Format: "type:catalog_name" -> catalog object
   */
  _buildCatalogMap() {
    this.catalogMap.clear();
    
    if (!this.catalogData || !Array.isArray(this.catalogData.catalogs)) {
      return;
    }

    this.catalogData.catalogs.forEach((catalog) => {
      if (catalog.catalog_type && catalog.catalog_name) {
        const key = `${catalog.catalog_type}:${catalog.catalog_name}`;
        this.catalogMap.set(key, catalog);
      }
    });

    logger.debug(`Built catalog map with ${this.catalogMap.size} entries`);
  }

  /**
   * Get all catalogs for manifest generation
   * @returns {Array} Array of catalog objects with catalog_name and catalog_type
   */
  getAllCatalogs() {
    if (!this.initialized || !this.catalogData) {
      throw new DataLoadError('Catalog data not initialized');
    }

    return this.catalogData.catalogs.map((catalog) => ({
      catalog_name: catalog.catalog_name,
      catalog_type: catalog.catalog_type,
    }));
  }

  /**
   * Get all unique content types from catalogs
   * @returns {Array} Array of unique types (e.g., ["movie", "series"])
   */
  getSupportedTypes() {
    if (!this.initialized || !this.catalogData) {
      throw new DataLoadError('Catalog data not initialized');
    }

    const types = new Set();
    this.catalogData.catalogs.forEach((catalog) => {
      if (catalog.catalog_type) {
        types.add(catalog.catalog_type);
      }
    });

    return Array.from(types);
  }

  /**
   * Get catalog items for a specific type and catalog ID
   * @param {string} type - Content type (e.g., "movie", "series")
   * @param {string} catalogId - Catalog ID (catalog_name from JSON)
   * @param {Object} pagination - Pagination options
   * @param {number} pagination.skip - Number of items to skip (default: 0)
   * @param {number} pagination.limit - Maximum number of items to return (default: all)
   * @returns {Array} Array of Stremio meta objects
   */
  getCatalogItems(type, catalogId, pagination = {}) {
    if (!this.initialized) {
      throw new DataLoadError('Catalog data not initialized');
    }

    const key = `${type}:${catalogId}`;
    const catalog = this.catalogMap.get(key);

    if (!catalog) {
      logger.warn(`Catalog not found: ${key}`);
      return [];
    }

    if (!Array.isArray(catalog.catalog_items)) {
      logger.warn(`Catalog has no items: ${key}`);
      return [];
    }

    // Transform catalog items to Stremio meta format
    let items = catalog.catalog_items.map((item) => this._transformToStremioMeta(item, type));

    // Apply pagination
    const skip = pagination.skip || 0;
    const limit = pagination.limit;

    if (skip > 0) {
      items = items.slice(skip);
    }

    if (limit && limit > 0) {
      items = items.slice(0, limit);
    }

    return items;
  }

  /**
   * Transform catalog item to Stremio meta format
   * @param {Object} item - Catalog item from JSON
   * @param {string} type - Content type
   * @returns {Object} Stremio meta object
   */
  _transformToStremioMeta(item, type) {
    const meta = {
      id: item.id || '',
      type: type,
      name: item.name || 'Unknown',
    };

    // Required fields
    if (item.poster) {
      meta.poster = item.poster;
    }

    // Optional fields
    if (item.banner) {
      meta.background = item.banner;
    }

    if (item.description) {
      meta.description = item.description;
    }

    if (item.releaseInfo) {
      meta.releaseInfo = item.releaseInfo;
    }

    if (item.runtime) {
      meta.runtime = item.runtime;
    }

    if (item.imdbRating) {
      meta.imdbRating = item.imdbRating;
    }

    return meta;
  }

  /**
   * Check if catalog exists
   * @param {string} type - Content type
   * @param {string} catalogId - Catalog ID
   * @returns {boolean}
   */
  catalogExists(type, catalogId) {
    if (!this.initialized) {
      return false;
    }

    const key = `${type}:${catalogId}`;
    return this.catalogMap.has(key);
  }
}

// Export singleton instance
module.exports = new CatalogService();

