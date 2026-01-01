/**
 * Addon Configuration
 * Contains the addon metadata and settings
 */

// Load environment variables
require('dotenv').config();

module.exports = {
  addonId: process.env.ADDON_ID || 'com.rkp.favourites',
  addonVersion: process.env.ADDON_VERSION || '0.2.0',
  addonName: process.env.ADDON_NAME || 'RKP Favourites',
  addonDescription: process.env.ADDON_DESCRIPTION || 'Private addon for personal use. Curated collection of Tamil movies and series sourced from IMDB, maintained using custom Python scripts. RKP represents Raghul Kaviya Prasad (Raghul Prasad and Kaviya).',
  addonLogo: process.env.ADDON_LOGO || 'https://i.postimg.cc/FHV0MjVT/rkp-favourites-logo.png',
  addonBackground: process.env.ADDON_BACKGROUND || null,
  idPrefixes: process.env.ID_PREFIXES ? process.env.ID_PREFIXES.split(',') : ['tt'],
  catalogDataPath: process.env.CATALOG_DATA_PATH || './catalog_data.json',
  port: process.env.PORT || 7000,
};

