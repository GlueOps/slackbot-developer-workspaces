FROM node:24-alpine@sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14

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
