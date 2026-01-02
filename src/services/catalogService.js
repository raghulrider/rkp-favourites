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
  }

  /**
   * Load catalog data from JSON file
   * @param {string} dataPath - Path to catalog_data.json
   */
  loadCatalogData(dataPath) {
    try {
      // Try multiple path resolution strategies for different environments
      let absolutePath = null;
      
      // Strategy 1: Resolve relative to current working directory
      const resolvedFromCwd = path.resolve(dataPath);
      if (fs.existsSync(resolvedFromCwd)) {
        absolutePath = resolvedFromCwd;
      } else {
        // Strategy 2: Resolve relative to this file's directory (for serverless)
        const resolvedFromModule = path.resolve(__dirname, '../../', dataPath);
        if (fs.existsSync(resolvedFromModule)) {
          absolutePath = resolvedFromModule;
        } else {
          // Strategy 3: Try absolute path if provided
          if (path.isAbsolute(dataPath) && fs.existsSync(dataPath)) {
            absolutePath = dataPath;
          } else {
            // Strategy 4: Try from process.cwd() with different relative paths
            const cwd = process.cwd();
            const pathsToTry = [
              path.join(cwd, dataPath),
              path.join(cwd, path.basename(dataPath)), // Just filename
              path.resolve(cwd, '..', dataPath),
              path.resolve(cwd, '..', path.basename(dataPath)),
            ];
            
            for (const tryPath of pathsToTry) {
              if (fs.existsSync(tryPath)) {
                absolutePath = tryPath;
                break;
              }
            }
          }
        }
      }
      
      if (!absolutePath || !fs.existsSync(absolutePath)) {
        throw new Error(`Catalog data file not found. Tried: ${dataPath}, resolved from cwd: ${path.resolve(dataPath)}, cwd: ${process.cwd()}`);
      }
      
      this.dataPath = absolutePath;
      logger.info(`Loading catalog data from: ${absolutePath}`);

      this._loadDataFromFile();

      return true;
    } catch (error) {
      logger.error('Failed to load catalog data:', error.message);
      throw new DataLoadError(error.message, error);
    }
  }

  /**
   * Load catalog data from file
   * @private
   */
  _loadDataFromFile() {
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
      logger.error('Failed to load catalog data:', error.message);
      throw new DataLoadError(error.message, error);
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
   * Get unique genres for a specific catalog
   * @param {string} type - Content type (e.g., "movie", "series")
   * @param {string} catalogId - Catalog ID (catalog_name from JSON)
   * @returns {Array} Array of unique genre strings, sorted alphabetically
   */
  getCatalogGenres(type, catalogId) {
    if (!this.initialized || !this.catalogData) {
      throw new DataLoadError('Catalog data not initialized');
    }

    const key = `${type}:${catalogId}`;
    const catalog = this.catalogMap.get(key);

    if (!catalog || !Array.isArray(catalog.catalog_items)) {
      return [];
    }

    const genres = new Set();
    catalog.catalog_items.forEach((item) => {
      if (Array.isArray(item.genres)) {
        item.genres.forEach((genre) => {
          if (genre && typeof genre === 'string') {
            genres.add(genre.trim());
          }
        });
      }
    });

    // Return sorted array of unique genres
    return Array.from(genres).sort();
  }

  /**
   * Get catalog items for a specific type and catalog ID
   * @param {string} type - Content type (e.g., "movie", "series")
   * @param {string} catalogId - Catalog ID (catalog_name from JSON)
   * @param {Object} options - Options object (or pagination object for backward compatibility)
   * @param {Object} options.pagination - Pagination options (if options has pagination property)
   * @param {number} options.pagination.skip - Number of items to skip (default: 0)
   * @param {number} options.pagination.limit - Maximum number of items to return (default: all)
   * @param {string} options.genre - Genre filter (optional)
   * @param {number} options.skip - Number of items to skip (backward compatibility, if pagination not nested)
   * @param {number} options.limit - Maximum number of items to return (backward compatibility, if pagination not nested)
   * @returns {Array} Array of Stremio meta objects
   */
  getCatalogItems(type, catalogId, options = {}) {
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

    // Extract options - handle both new format (options.pagination) and old format (options directly)
    let pagination, genre;
    if (options.pagination && typeof options.pagination === 'object') {
      // New format: { pagination: { skip, limit }, genre: ... }
      pagination = options.pagination;
      genre = options.genre || null;
    } else {
      // Old format: { skip, limit } or backward compatibility
      pagination = options;
      genre = null;
    }

    // Filter items by genre if genre is specified
    let catalogItems = catalog.catalog_items;
    if (genre && typeof genre === 'string') {
      const genreLower = genre.trim().toLowerCase();
      catalogItems = catalogItems.filter((item) => {
        if (!Array.isArray(item.genres)) {
          return false;
        }
        return item.genres.some(
          (itemGenre) => itemGenre && itemGenre.trim().toLowerCase() === genreLower
        );
      });
      logger.debug(`Filtered ${catalog.catalog_items.length} items to ${catalogItems.length} items for genre: ${genre}`);
    }

    // Transform catalog items to Stremio meta format
    let items = catalogItems.map((item) => this._transformToStremioMeta(item, type));

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

