FROM node:22-alpine@sha256:5539840ce9d013fa13e3b9814c9353024be7ac75aca5db6d039504a56c04ea59

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
