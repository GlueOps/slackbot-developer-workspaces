FROM node:24-alpine@sha256:51dbfc749ec3018c7d4bf8b9ee65299ff9a908e38918ce163b0acfcd5dd931d9

# Set the working directory to /app
WORKDIR /app

# Copy all project files
COPY bot/ bot/
COPY command-handler/ command-handler/
COPY server/ server/

# Install dependencies and link command-handler globally
WORKDIR /app/command-handler
RUN npm ci
RUN npm link

# Install dependencies for express server
WORKDIR /app/server
RUN npm ci

# Go to bot directory, install dependencies, and link both command-handler and server
WORKDIR /app/bot
RUN npm ci
RUN npm link command-handler

# Expose port 5000
EXPOSE 5000

# Set the command to run the bot
CMD ["node", "."]