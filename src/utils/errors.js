/**
 * Error handling utilities
 */

class CatalogNotFoundError extends Error {
  constructor(catalogId, type) {
    super(`Catalog not found: ${type}/${catalogId}`);
    this.name = 'CatalogNotFoundError';
    this.catalogId = catalogId;
    this.type = type;
  }
}

class InvalidTypeError extends Error {
  constructor(type) {
    super(`Invalid content type: ${type}`);
    this.name = 'InvalidTypeError';
    this.type = type;
  }
}

class DataLoadError extends Error {
  constructor(message, originalError) {
    super(`Failed to load catalog data: ${message}`);
    this.name = 'DataLoadError';
    this.originalError = originalError;
  }
}

module.exports = {
  CatalogNotFoundError,
  InvalidTypeError,
  DataLoadError,
};

