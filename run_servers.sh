#!/bin/bash
set -e

# Start backend (Node.js, no external deps)
node /app/backend/server.js &

# Install and start frontend (Next.js)
cd /app/frontend
npm install
npm run dev &
