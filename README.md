# RKP Favourites - Stremio Catalog Addon

A Stremio catalog addon that provides curated collections of favorite movies and series.

## Features

- 🎬 Dynamic catalog generation from JSON data
- 📺 Support for both movies and series (future-ready)
- 🚀 Production-grade Node.js structure
- ⚡ Fast in-memory caching
- 🛡️ Comprehensive error handling
- 📝 Detailed logging

## Project Structure

```
rkp-favourites/
├── api/
│   └── index.js                 # Vercel serverless function
├── src/
│   ├── config/
│   │   ├── addonConfig.js       # Addon configuration
│   │   └── manifest.js          # Dynamic manifest generation
│   ├── controllers/
│   │   └── catalogController.js # Catalog request handlers
│   ├── services/
│   │   └── catalogService.js    # Catalog data management
│   ├── utils/
│   │   ├── logger.js            # Logging utility
│   │   └── errors.js            # Custom error classes
│   └── index.js                 # Addon builder setup
├── catalog_data.json            # Source catalog data
├── server.js                    # HTTP server entry point (for Render/other platforms)
├── start-with-tunnel.js         # Server with optional ngrok tunnel
├── vercel.json                  # Vercel configuration
├── package.json
├── .env.example                 # Environment variables template
└── README.md
```

## Prerequisites

- Node.js >= 14.0.0
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd rkp-favourites
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (optional):
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

### Environment Variables

Create a `.env` file or set these environment variables:

- `PORT` - Server port (default: 7000)
- `ADDON_ID` - Unique addon identifier (default: com.rkp.favourites)
- `ADDON_NAME` - Addon display name (default: RKP Favourites)
- `ADDON_DESCRIPTION` - Addon description
- `ADDON_VERSION` - Addon version (default: 1.0.0)
- `CATALOG_DATA_PATH` - Path to catalog_data.json (default: ./catalog_data.json)
- `LOG_LEVEL` - Logging level: error, warn, info, debug (default: info)

### Catalog Data Format

The `catalog_data.json` file should follow this structure:

```json
{
  "catalogs": [
    {
      "catalog_name": "best_movies_of_2025",
      "catalog_type": "movie",
      "catalog_items": [
        {
          "name": "Movie Name",
          "id": "tt12345678",
          "poster": "https://...",
          "banner": "https://...",
          "description": "Movie description",
          "imdbRating": "8.5",
          "releaseInfo": "2025",
          "runtime": "2h 30m"
        }
      ]
    }
  ]
}
```

## Running the Addon

### Development

```bash
npm start
```

The addon will be available at `http://localhost:7000/manifest.json`

### Docker with Ngrok (Background)

Run the addon in a Docker container with ngrok enabled for external access:

**Prerequisites:**
1. Sign up for a free ngrok account at [ngrok.com](https://ngrok.com/)
2. Get your authtoken from [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken)
   - Copy your authtoken (it looks like: `2abc123def456ghi789jkl012mno345pqr678stu901vwx234yz_5AbC6DeF7GhI8JkL9MnO`)

**Build the Docker image:**
```bash
docker build -t rkp-favourites .
```

**Run in background (detached mode) with volume mount:**

**Method 1: Pass token directly in command (replace `YOUR_NGROK_TOKEN` with your actual token):**
```bash
docker run -d \
  --name rkp-favourites \
  -p 7000:7000 \
  -v $(pwd)/catalog_data.json:/app/catalog_data.json:ro \
  -e ENVIRONMENT=local \
  -e NGROK_AUTHTOKEN=YOUR_NGROK_TOKEN \
  rkp-favourites
```

**Method 2: Use environment file (recommended for security):**

Create a `.env` file in your project directory:
```bash
ENVIRONMENT=local
NGROK_AUTHTOKEN=YOUR_NGROK_TOKEN
NGROK_DOMAIN=your-domain.ngrok.io  # Optional, requires paid plan
```

Then run:
```bash
docker run -d \
  --name rkp-favourites \
  -p 7000:7000 \
  -v $(pwd)/catalog_data.json:/app/catalog_data.json:ro \
  --env-file .env \
  rkp-favourites
```

**Method 3: Export as environment variable:**
```bash
export ENVIRONMENT=local
export NGROK_AUTHTOKEN=YOUR_NGROK_TOKEN
docker run -d \
  --name rkp-favourites \
  -p 7000:7000 \
  -v $(pwd)/catalog_data.json:/app/catalog_data.json:ro \
  -e ENVIRONMENT \
  -e NGROK_AUTHTOKEN \
  rkp-favourites
```

**Note:** 
- Replace `YOUR_NGROK_TOKEN` with your actual ngrok authtoken
- The `-v $(pwd)/catalog_data.json:/app/catalog_data.json:ro` flag mounts your local `catalog_data.json` file into the container
- The `:ro` makes it read-only. When you update the file on your host, the server will automatically reload it without restarting the container

**View logs:**
```bash
docker logs -f rkp-favourites
```

**Stop the container:**
```bash
docker stop rkp-favourites
```

**Remove the container:**
```bash
docker rm rkp-favourites
```

**Environment Variables for Docker:**
- `ENVIRONMENT` - Set to `local` to enable ngrok tunneling, otherwise runs server only (default: `production`)
- `PORT` - Server port (default: 7000, automatically set by Render/Heroku)
- `CATALOG_DATA_PATH` - Path to catalog_data.json in container (default: `/app/catalog_data.json`)
- `NGROK_AUTHTOKEN` - **Required if ENVIRONMENT=local**: Your ngrok authtoken (get it from [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken))
- `NGROK_DOMAIN` - Optional: Custom domain (requires paid ngrok plan, e.g., "rkp-favourites.ngrok.io")
- `NGROK_REGION` - Optional: Ngrok region (default: "us"). Options: us, eu, ap, au, sa, jp, in

**Volume Mount:**
- Mount your local `catalog_data.json` to `/app/catalog_data.json` in the container
- The server automatically watches for file changes and reloads the catalog data
- Updates take effect within 1-2 seconds without restarting the container

The container will:
1. Start the Stremio addon server
2. If `ENVIRONMENT=local`: Wait for server to be ready, then start ngrok tunnel
3. If `ENVIRONMENT=production` (or not set): Run server only, no tunnel
4. Display the public URL in the logs
5. Automatically reconnect tunnel if it drops (local mode only)
6. **Automatically reload catalog data when `catalog_data.json` is updated** (if mounted as volume)

**Updating Catalog Data:**
Simply edit `catalog_data.json` on your host machine. The server will detect the change and automatically reload the catalog data within 1-2 seconds. No container restart needed!

**Get the public URL:**
Check the container logs to see the ngrok URL:
```bash
docker logs rkp-favourites | grep "Public tunnel URL"
```

Or access ngrok's web interface at `http://localhost:4040` (if you expose the port):
```bash
docker run -d \
  --name rkp-favourites \
  -p 7000:7000 \
  -p 4040:4040 \
  -e NGROK_AUTHTOKEN=your-ngrok-authtoken \
  rkp-favourites
```

The output will show something like: `your url is: https://your-subdomain.loca.lt`

### Testing in Stremio

1. Start the addon server (or Docker container)
2. Open Stremio desktop app
3. Go to Addons → Community Addons
4. Click "Add Addon" or paste the manifest URL
5. Enter:
   - Local: `http://localhost:7000/manifest.json`
   - Docker with tunnel: `https://your-subdomain.loca.lt/manifest.json`

## Deployment

The addon can be deployed to any Node.js hosting service:

### Render (Recommended)

**Prerequisites:**
- GitHub account
- Render account (sign up at [render.com](https://render.com))

**Deployment Steps:**

1. **Push your code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin your-github-repo-url
   git push -u origin main
   ```

2. **Create a new Web Service on Render:**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure the service:
     - **Name:** rkp-favourites (or any name you prefer)
     - **Environment:** Node
     - **Build Command:** `npm install --production`
     - **Start Command:** `node start-with-tunnel.js`
     - **Plan:** Free (or paid if you prefer)

3. **Set Environment Variables in Render:**
   - Go to your service → Environment
   - Add the following variables:
     - `ENVIRONMENT` = `production` (or leave unset, defaults to production)
     - `PORT` = (automatically set by Render, no need to set manually)
     - `CATALOG_DATA_PATH` = `/opt/render/project/src/catalog_data.json` (or relative path)
     - Add any other addon configuration variables (ADDON_ID, ADDON_NAME, etc.)

4. **Deploy:**
   - Render will automatically build and deploy
   - Your addon will be available at: `https://your-service-name.onrender.com/manifest.json`

**Note:** 
- Render automatically sets the `PORT` environment variable
- Since `ENVIRONMENT` is not set to `local`, ngrok will not be used
- The server will run directly on Render's provided port
- Make sure `catalog_data.json` is committed to your repository (or use a different data source)

### Vercel (Hobby/Free Tier)

**Prerequisites:**
- GitHub account
- Vercel account (sign up at [vercel.com](https://vercel.com))

**Deployment Steps:**

1. **Push your code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin your-github-repo-url
   git push -u origin main
   ```

2. **Deploy to Vercel:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - Configure the project settings:
     - **Framework Preset:** `Other` (or leave as auto-detected)
     - **Root Directory:** `./` (default)
     - **Build and Output Settings:**
       - **Build Command:** Leave empty or set to `npm install` (no build step needed for serverless functions)
       - **Output Directory:** `.` (current directory)
       - **Install Command:** `npm install` (or leave default - Vercel will auto-detect)
   - Click "Deploy"

3. **Set Environment Variables in Vercel:**
   - Go to your project → Settings → Environment Variables
   - Add the following variables (optional, defaults are used if not set):
     - `ENVIRONMENT` = `production` (already set in vercel.json)
     - `CATALOG_DATA_PATH` = `./catalog_data.json`
     - `ADDON_ID` = `com.rkp.favourites`
     - `ADDON_NAME` = `RKP Favourites`
     - `ADDON_VERSION` = `0.2.0`
     - `ADDON_DESCRIPTION` = (your description)
     - `ADDON_LOGO` = (your logo URL)
     - `ADDON_BACKGROUND` = (optional background URL)

4. **Deploy:**
   - Vercel will automatically build and deploy
   - Your addon will be available at: `https://your-project-name.vercel.app/manifest.json`

**Vercel Configuration:**
- Uses serverless functions (no long-running server)
- All requests are routed through `/api/index.js`
- Includes `/healthz` endpoint for health checks
- Automatic HTTPS and CDN
- Free tier includes: 100GB bandwidth, unlimited requests (with usage limits)

**Note:**
- Vercel uses serverless functions, so there may be cold starts on first request
- `catalog_data.json` must be committed to your repository (not in `.gitignore`)
- The file will be automatically included in the deployment
- If you get a "file not found" error, check that `catalog_data.json` is in the repository root
- The addon interface and manifest are cached for performance
- Health check available at: `https://your-project-name.vercel.app/healthz`

**Troubleshooting:**
- If you see "Catalog data file not found" error, verify:
  1. `catalog_data.json` is committed to your Git repository
  2. The file is in the repository root (same level as `package.json`)
  3. The file is not in `.gitignore`
  4. Check Vercel build logs to see if the file is being included

### Other Hosting Options

- **Heroku** - Free tier available
- **cloudno.de** - Free for up to 150k requests/month
- **Evennode** - 7-day free trial
- **Railway** - Modern deployment platform

### Publishing to Stremio

After deployment, publish your addon to Stremio's central catalog:

```javascript
const { publishToCentral } = require('stremio-addon-sdk');
publishToCentral('https://your-deployed-url.com/manifest.json');
```

## How It Works

1. **Startup**: The addon loads `catalog_data.json` and caches it in memory
2. **Manifest Generation**: Dynamically generates manifest based on catalogs in the data file
3. **Catalog Requests**: When Stremio requests a catalog, the addon:
   - Validates the request (type and ID)
   - Looks up the catalog in cached data
   - Transforms items to Stremio meta format
   - Returns the catalog items

## Adding New Catalogs

Simply update `catalog_data.json` with new catalogs. The manifest will automatically update on next restart. No code changes needed!

## Support

For issues or questions, please open an issue on the repository.

## License

ISC

