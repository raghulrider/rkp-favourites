/**
 * Startup script that conditionally runs server with or without ngrok tunnel
 * - If ENVIRONMENT=local: runs server + ngrok tunnel
 * - Otherwise: runs server only (for production deployments like Render)
 */

const { spawn } = require('child_process');
const http = require('http');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 7000;
const ENVIRONMENT = process.env.ENVIRONMENT || 'production';
const NGROK_AUTHTOKEN = process.env.NGROK_AUTHTOKEN || null;
const NGROK_DOMAIN = process.env.NGROK_DOMAIN || null;
const NGROK_REGION = process.env.NGROK_REGION || 'us'; // us, eu, ap, au, sa, jp, in

const isLocal = ENVIRONMENT.toLowerCase() === 'local';

// Start the server
logger.info(`Starting Stremio addon server on port ${PORT}...`);
logger.info(`Environment: ${ENVIRONMENT}${isLocal ? ' (with ngrok tunnel)' : ' (production mode, no tunnel)'}`);

const server = spawn('node', ['server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: PORT.toString() }
});

// Track checkServer interval (only used in local mode)
let checkServer = null;

// If local environment, wait for server and start tunnel
// Otherwise, just let the server run
if (isLocal) {
  // Wait for server to be ready, then start tunnel
  let serverReady = false;
  checkServer = setInterval(() => {
    const req = http.get(`http://localhost:${PORT}/manifest.json`, (res) => {
      if (res.statusCode === 200 && !serverReady) {
        serverReady = true;
        if (checkServer) {
          clearInterval(checkServer);
          checkServer = null;
        }
        startTunnel();
      }
    });
    
    req.on('error', () => {
      // Server not ready yet, continue checking
    });
    
    req.setTimeout(1000, () => {
      req.destroy();
    });
  }, 1000);
} else {
  logger.info('Running in production mode - no tunnel needed');
}

// Tunnel management variables
let tunnelProcess = null;
let tunnelRestartCount = 0;
const MAX_RESTART_DELAY = 30000; // 30 seconds max delay
const INITIAL_RESTART_DELAY = 2000; // 2 seconds initial delay

// Start ngrok after server is ready (only called if ENVIRONMENT=local)
function startTunnel() {
  if (!isLocal) {
    return; // Should not be called in production mode
  }
  
  if (!NGROK_AUTHTOKEN) {
    logger.warn('⚠️  NGROK_AUTHTOKEN not set. Ngrok will work but with limitations.');
    logger.warn('   Get your free authtoken at: https://dashboard.ngrok.com/get-started/your-authtoken');
  }
  logger.info('Server is ready, starting ngrok...');
  startTunnelProcess();
}

function startTunnelProcess() {
  // Build ngrok command
  // Syntax: ngrok http <port> [--domain=<domain>] [--region=<region>]
  const tunnelArgs = ['http', PORT.toString()];
  
  if (NGROK_DOMAIN) {
    tunnelArgs.push('--domain', NGROK_DOMAIN);
    if (tunnelRestartCount === 0) {
      logger.info(`Using custom domain: ${NGROK_DOMAIN} (requires paid ngrok plan)`);
    }
  } else if (tunnelRestartCount === 0) {
    logger.info('Using free ngrok tunnel (random subdomain)');
  }
  
  if (NGROK_REGION && NGROK_REGION !== 'us') {
    tunnelArgs.push('--region', NGROK_REGION);
  }

  if (tunnelRestartCount > 0) {
    logger.info(`Restarting ngrok (attempt ${tunnelRestartCount + 1})...`);
  } else {
    logger.info(`Starting ngrok with args: ${tunnelArgs.join(' ')}`);
  }
  
  // Set up environment for ngrok
  const tunnelEnv = { ...process.env };
  if (NGROK_AUTHTOKEN) {
    tunnelEnv.NGROK_AUTHTOKEN = NGROK_AUTHTOKEN;
  }
  
  // Capture tunnel output to log the URL
  tunnelProcess = spawn('npx', ['-y', 'ngrok', ...tunnelArgs], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: tunnelEnv
  });

  // Capture stdout to extract the URL
  let tunnelOutput = '';
  tunnelProcess.stdout.on('data', (data) => {
    const output = data.toString();
    tunnelOutput += output;
    process.stdout.write(output); // Show in console
    
    // Ngrok outputs JSON to stdout, look for URL in various formats
    // Try to extract URL from ngrok's output
    const urlPatterns = [
      /https?:\/\/[a-z0-9-]+\.ngrok(-[a-z]+)?\.io/g,
      /"public_url":\s*"([^"]+)"/i,
      /Forwarding\s+([^\s]+)\s+->/i
    ];
    
    for (const pattern of urlPatterns) {
      const matches = output.match(pattern);
      if (matches) {
        const tunnelUrl = matches[1] || matches[0];
        if (tunnelUrl.startsWith('http')) {
          if (tunnelRestartCount === 0) {
            logger.info(`✅ Public tunnel URL: ${tunnelUrl}`);
            logger.info(`📋 Use this URL in Stremio: ${tunnelUrl}/manifest.json`);
          } else {
            logger.info(`✅ Tunnel reconnected. URL: ${tunnelUrl}`);
          }
          // Reset restart count on successful connection
          tunnelRestartCount = 0;
          break;
        }
      }
    }
  });

  tunnelProcess.stderr.on('data', (data) => {
    const output = data.toString();
    process.stderr.write(output);
    
    // Check for common ngrok errors
    if (output.includes('authtoken') || output.includes('authentication')) {
      logger.error('❌ Ngrok authentication failed. Please set NGROK_AUTHTOKEN environment variable.');
      logger.error('   Get your free authtoken at: https://dashboard.ngrok.com/get-started/your-authtoken');
    } else if (output.includes('domain') && output.includes('not found')) {
      logger.error(`❌ Domain '${NGROK_DOMAIN}' not found. Check your ngrok account.`);
    } else if (output.includes('ERR_NGROK')) {
      logger.error('❌ Ngrok error occurred. Check the output above for details.');
    }
  });

  tunnelProcess.on('close', (code) => {
    logger.warn(`Ngrok exited with code ${code}`);
    tunnelProcess = null;
    
    // Automatically restart tunnel
    if (code !== null && code !== 0) {
      tunnelRestartCount++;
      const delay = Math.min(INITIAL_RESTART_DELAY * Math.pow(2, tunnelRestartCount - 1), MAX_RESTART_DELAY);
      logger.info(`Reconnecting ngrok in ${delay / 1000} seconds...`);
      
      setTimeout(() => {
        if (tunnelProcess === null) {
          startTunnelProcess();
        }
      }, delay);
    } else if (code === 0) {
      // Exit code 0 might be normal shutdown, but restart anyway to keep tunnel alive
      tunnelRestartCount++;
      const delay = INITIAL_RESTART_DELAY;
      logger.info(`Ngrok closed, reconnecting in ${delay / 1000} seconds...`);
      
      setTimeout(() => {
        if (tunnelProcess === null) {
          startTunnelProcess();
        }
      }, delay);
    }
  });

  tunnelProcess.on('error', (error) => {
    logger.error('Ngrok error:', error.message);
    tunnelProcess = null;
    
    // Restart on error
    tunnelRestartCount++;
    const delay = Math.min(INITIAL_RESTART_DELAY * Math.pow(2, tunnelRestartCount - 1), MAX_RESTART_DELAY);
    logger.info(`Reconnecting ngrok after error in ${delay / 1000} seconds...`);
    
    setTimeout(() => {
      if (tunnelProcess === null) {
        startTunnelProcess();
      }
    }, delay);
  });
}

// Handle server process
server.on('close', (code) => {
  logger.warn(`Server exited with code ${code}`);
  if (checkServer) {
    clearInterval(checkServer);
    checkServer = null;
  }
  process.exit(code);
});

server.on('error', (error) => {
  logger.error('Server error:', error.message);
  if (checkServer) {
    clearInterval(checkServer);
    checkServer = null;
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  if (checkServer) {
    clearInterval(checkServer);
    checkServer = null;
  }
  if (tunnelProcess) {
    tunnelProcess.kill();
  }
  server.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  if (checkServer) {
    clearInterval(checkServer);
    checkServer = null;
  }
  if (tunnelProcess) {
    tunnelProcess.kill();
  }
  server.kill();
  process.exit(0);
});
