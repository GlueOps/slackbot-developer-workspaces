FROM node:24-alpine@sha256:4f696fbf39f383c1e486030ba6b289a5d9af541642fc78ab197e584a113b9c03

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
