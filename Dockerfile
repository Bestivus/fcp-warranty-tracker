# STAGE 1: Build the React Frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
# Copy package files and install dependencies
COPY frontend/package*.json ./
RUN npm install

# Copy source code and build
COPY frontend/ .
RUN npm run build

# STAGE 2: Build the Node.js Backend & Serve Frontend
FROM node:20-alpine

WORKDIR /app/backend
COPY backend/package*.json ./
# Install production dependencies (including SQLite)
RUN npm install --production
COPY backend/ .

# Copy the built React app from Stage 1 into the backend's public folder
COPY --from=frontend-build /app/frontend/dist ./public

# IMPORTANT: Tell the server it is in production mode!
ENV NODE_ENV=production

# Create a clean directory for our persistent database
RUN mkdir -p /app/data

EXPOSE 3000

# Start the Node backend
CMD ["node", "server.js"]