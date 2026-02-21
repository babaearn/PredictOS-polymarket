FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY server/package*.json ./
RUN npm ci

# Copy source and build TypeScript
COPY server/ ./
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
