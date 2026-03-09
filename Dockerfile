# Dockerfile for VideoCompressor Pro (Backend Engine Edition)
# This containerizes the FFmpeg processing logic for scalable deployment

FROM node:20-alpine

# Install FFmpeg at OS level inside Alpine Linux
RUN apk update && \
    apk add --no-cache ffmpeg

# Create app directory
WORKDIR /usr/src/app

# Only copy relevant backend logic (UI is desktop only)
# In a real business scenario, main.js would be refactored into an Express API here.
# For now, we set up the environment block.
COPY package*.json ./

RUN npm install --only=production

# The default command could be an API server that accepts compress jobs in a queue
CMD [ "node", "server.js" ]
