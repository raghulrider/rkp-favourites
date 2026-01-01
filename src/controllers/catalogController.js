/**
 * Catalog Controller
 * Handles catalog requests from Stremio
 */

const catalogService = require('../services/catalogService');
const logger = require('../utils/logger');
const { InvalidTypeError, CatalogNotFoundError } = require('../utils/errors');

/**
 * Catalog handler for Stremio addon
 * @param {Object} args - Request arguments from Stremio
 * @param {string} args.type - Content type (e.g., "movie", "series")
 * @param {string} args.id - Catalog ID (catalog_name from JSON)
 * @param {Object} args.extra - Extra parameters (optional)
 * @returns {Promise<Object>} Stremio catalog response
 */
async function handleCatalogRequest(args) {
  const { type, id, extra } = args || {};

  logger.debug(`Catalog request received: type=${type}, id=${id}, extra=${JSON.stringify(extra)}`);

  // Validate type
  if (!type) {
    logger.warn('Catalog request missing type parameter');
    return Promise.resolve({ metas: [] });
  }

  // Validate type against supported types
  const supportedTypes = catalogService.getSupportedTypes();
  if (!supportedTypes.includes(type)) {
    logger.warn(`Unsupported content type requested: ${type}`);
    return Promise.resolve({ metas: [] });
  }

  // Validate catalog ID
  if (!id) {
    logger.warn('Catalog request missing id parameter');
    return Promise.resolve({ metas: [] });
  }

  try {
    // Extract pagination parameters from extra
    let skip = extra?.skip ? parseInt(extra.skip, 10) : 0;
    let limit = extra?.limit ? parseInt(extra.limit, 10) : undefined;

    // Validate pagination parameters
    if (isNaN(skip) || skip < 0) {
      logger.warn(`Invalid skip parameter: ${extra?.skip}, using 0`);
      skip = 0;
    }
    if (limit !== undefined && (isNaN(limit) || limit < 0)) {
      logger.warn(`Invalid limit parameter: ${extra?.limit}, ignoring limit`);
      limit = undefined;
    }

    // Get catalog items with pagination
    const pagination = { skip, limit };
    const items = catalogService.getCatalogItems(type, id, pagination);

    if (items.length === 0) {
      logger.warn(`No items found for catalog: ${type}/${id} (skip: ${skip}, limit: ${limit})`);
      return Promise.resolve({ metas: [] });
    }

    logger.info(`Returning ${items.length} items for catalog: ${type}/${id} (skip: ${skip}, limit: ${limit || 'none'})`);

    return Promise.resolve({
      metas: items,
    });
  } catch (error) {
    logger.error(`Error handling catalog request ${type}/${id}:`, error.message);
    // Return empty array on error (Stremio expects valid response)
    return Promise.resolve({ metas: [] });
  }
}

module.exports = {
  handleCatalogRequest,
};

