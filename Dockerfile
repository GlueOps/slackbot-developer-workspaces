FROM node:24-alpine@sha256:951203ef9d4e576c355194222fd19c2c7736f91228deb112675414ae3a7c9046

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
