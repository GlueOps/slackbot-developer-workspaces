FROM node:22-alpine@sha256:51eff88af6dff26f59316b6e356188ffa2c422bd3c3b76f2556a2e7e89d080bd

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