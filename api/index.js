/**
 * Vercel Serverless Function
 * Handles all requests for the Stremio addon
 */

const buildAddon = require('../src/index');
const { handleCatalogRequest } = require('../src/controllers/catalogController');
const { generateManifest } = require('../src/config/manifest');
const addonConfig = require('../src/config/addonConfig');
const logger = require('../src/utils/logger');
const path = require('path');
const fs = require('fs');

// Cache the addon interface and manifest
let cachedAddonInterface = null;
let cachedManifest = null;
let initializationPromise = null; // Promise to track initialization

/**
 * Resolve catalog data path for Vercel serverless environment
 */
function resolveCatalogDataPath() {
  const configPath = addonConfig.catalogDataPath || './catalog_data.json';
  
  // In Vercel, process.cwd() is typically /var/task/
  // The file should be at the project root
  const cwd = process.cwd();
  logger.info(`Current working directory: ${cwd}`);
  logger.info(`__dirname: ${__dirname}`);
  
  // Try multiple resolution strategies
  const pathsToTry = [
    // 1. From process.cwd() (most common in Vercel: /var/task/catalog_data.json)
    path.join(cwd, 'catalog_data.json'),
    // 2. Relative to API function directory (api/../catalog_data.json)
    path.resolve(__dirname, '..', 'catalog_data.json'),
    // 3. From config path relative to cwd
    path.isAbsolute(configPath) ? configPath : path.join(cwd, configPath.replace(/^\.\//, '')),
    // 4. Try just the filename in cwd
    path.join(cwd, path.basename(configPath)),
    // 5. Absolute path if provided
    configPath.startsWith('/') ? configPath : null,
  ].filter(Boolean);
  
  logger.info(`Trying to find catalog_data.json in: ${pathsToTry.join(', ')}`);
  
  for (const tryPath of pathsToTry) {
    if (fs.existsSync(tryPath)) {
      logger.info(`✓ Found catalog data at: ${tryPath}`);
      return tryPath;
    } else {
      logger.debug(`✗ Not found: ${tryPath}`);
    }
  }
  
  // If none found, throw a detailed error
  const errorMsg = `Catalog data file not found. Searched in:\n${pathsToTry.map(p => `  - ${p}`).join('\n')}\nCurrent working directory: ${cwd}\n__dirname: ${__dirname}`;
  logger.error(errorMsg);
  throw new Error(errorMsg);
}

async function getAddonInterface() {
  // If already initialized, return immediately
  if (cachedAddonInterface) {
    return cachedAddonInterface;
  }
  
  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return await initializationPromise;
  }
  
  // Start initialization (synchronized to prevent race conditions)
  initializationPromise = (async () => {
    try {
      // Resolve catalog data path for Vercel environment
      const catalogDataPath = resolveCatalogDataPath();
      cachedAddonInterface = buildAddon({ catalogDataPath });
      logger.info('Addon built successfully for Vercel');
      return cachedAddonInterface;
    } catch (error) {
      logger.error('Failed to build addon:', error.message);
      // Reset promise on error so we can retry
      initializationPromise = null;
      throw error;
    }
  })();
  
  return await initializationPromise;
}

async function getManifest() {
  if (!cachedManifest) {
    try {
      // Ensure addon is built first (this initializes catalog service)
      await getAddonInterface();
      
      // Now generate manifest
      const manifestConfig = {
        addonId: addonConfig.addonId,
        addonVersion: addonConfig.addonVersion,
        addonName: addonConfig.addonName,
        addonDescription: addonConfig.addonDescription,
        addonLogo: addonConfig.addonLogo,
        addonBackground: addonConfig.addonBackground,
        idPrefixes: addonConfig.idPrefixes,
      };
      cachedManifest = generateManifest(manifestConfig);
    } catch (error) {
      logger.error('Failed to generate manifest:', error.message);
      throw error;
    }
  }
  return cachedManifest;
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  try {
    // Vercel provides req.url which may be a path or full URL
    // Extract pathname safely
    let path = req.url || '/';
    try {
      const url = new URL(path, `http://${req.headers.host || 'localhost'}`);
      path = url.pathname;
    } catch (e) {
      // If URL parsing fails, use req.url as-is (it's likely just a path)
      path = req.url || '/';
    }
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // Handle manifest request
    if (path === '/manifest.json' || path === '/manifest.json/') {
      try {
        // Ensure addon is initialized before getting manifest
        await getAddonInterface();
        const manifest = await getManifest();
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(manifest);
      } catch (error) {
        logger.error('Error getting manifest:', error.message);
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ error: 'Failed to load manifest', message: error.message });
      }
    }
    
    // Handle catalog requests: /catalog/{type}/{id}.json
    const catalogMatch = path.match(/^\/catalog\/([^\/]+)\/([^\/]+)\.json$/);
    if (catalogMatch) {
      const [, type, id] = catalogMatch;
      const extra = req.query || {};
      
      try {
        // Ensure addon is initialized before handling catalog request
        await getAddonInterface();
        const result = await handleCatalogRequest({ type, id, extra });
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(result);
      } catch (error) {
        logger.error(`Error handling catalog request ${type}/${id}:`, error.message);
        res.setHeader('Content-Type', 'application/json');
        // Return empty array on error (Stremio expects valid response)
        return res.status(200).json({ metas: [] });
      }
    }
    
    // Health check endpoint
    if (path === '/healthz' || path === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: addonConfig.addonVersion || '0.2.0'
      });
    }
    
    // Root path - redirect to manifest
    if (path === '/' || path === '') {
      const origin = req.headers['x-forwarded-proto'] 
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `https://${req.headers.host || 'localhost'}`;
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        message: 'RKP Favourites Stremio Addon',
        manifest: `${origin}/manifest.json`,
        health: `${origin}/healthz`
      });
    }
    
    // 404 for unknown paths
    res.setHeader('Content-Type', 'application/json');
    return res.status(404).json({ error: 'Not found', path });
  } catch (error) {
    logger.error('Vercel function error:', error.message);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

