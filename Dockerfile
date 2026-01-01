# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (including ngrok for local development)
# Use npm install with --production flag for better compatibility
RUN npm install --production --no-audit --no-fund

# Copy application files (excluding catalog_data.json - will be mounted as volume)
COPY src/ ./src/
COPY server.js ./
COPY start-with-tunnel.js ./
COPY package.json ./

# Expose port
EXPOSE 7000

# Start the application with tunnel
CMD ["node", "start-with-tunnel.js"]

