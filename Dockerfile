FROM node:22-alpine@sha256:d2166de198f26e17e5a442f537754dd616ab069c47cc57b889310a717e0abbf9

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
