FROM node:22-alpine@sha256:6e80991f69cc7722c561e5d14d5e72ab47c0d6b6cfb3ae50fb9cf9a7b30fdf97

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