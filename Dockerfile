FROM node:20-alpine@sha256:2d07db07a2df6830718ae2a47db6fedce6745f5bcd174c398f2acdda90a11c03

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

# Install dependencies and link server globally
WORKDIR /app/server
RUN npm ci
RUN npm link

# Go to bot directory, install dependencies, and link both command-handler and server
WORKDIR /app/bot
RUN npm ci
RUN npm link command-handler server

# Expose port 5000
EXPOSE 5000

# Set the command to run the bot
CMD ["node", "."]