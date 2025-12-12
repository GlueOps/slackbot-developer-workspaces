FROM node:24-alpine@sha256:7e0bd0460b26eb3854ea5b99b887a6a14d665d14cae694b78ae2936d14b2befb

# Set the working directory to /app
WORKDIR /app

# Copy all project files
COPY . .

WORKDIR /app
RUN npm ci --only=production

# Expose port 5000
EXPOSE 5000

# Set the command to run the bot
CMD ["node", "."]
