FROM node:22-alpine@sha256:93d1011bb2c616733850ebb39a24c665306505425e46ca99ca1990954f278539

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
