/**
 * Vercel Serverless Function
 * Handles all requests for the Stremio addon
 */

const buildAddon = require('../src/index');
const { handleCatalogRequest } = require('../src/controllers/catalogController');
const { generateManifest } = require('../src/config/manifest');
const addonConfig = require('../src/config/addonConfig');
const logger = require('../src/utils/logger');

// Cache the addon interface and manifest
let cachedAddonInterface = null;
let cachedManifest = null;

function getAddonInterface() {
  if (!cachedAddonInterface) {
    try {
      cachedAddonInterface = buildAddon();
      logger.info('Addon built successfully for Vercel');
    } catch (error) {
      logger.error('Failed to build addon:', error.message);
      throw error;
    }
  }
  return cachedAddonInterface;
}

function getManifest() {
  if (!cachedManifest) {
    try {
      // Ensure addon is built first (this initializes catalog service)
      getAddonInterface();
      
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
      const manifest = getManifest();
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json(manifest);
    }
    
    // Handle catalog requests: /catalog/{type}/{id}.json
    const catalogMatch = path.match(/^\/catalog\/([^\/]+)\/([^\/]+)\.json$/);
    if (catalogMatch) {
      const [, type, id] = catalogMatch;
      const extra = req.query || {};
      
      try {
        const result = await handleCatalogRequest({ type, id, extra });
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(result);
      } catch (error) {
        logger.error(`Error handling catalog request ${type}/${id}:`, error.message);
        res.setHeader('Content-Type', 'application/json');
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

