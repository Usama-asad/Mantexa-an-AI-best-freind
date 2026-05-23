# Use Node.js LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# 1. Copy package files
COPY package*.json ./

# 2. Install dependencies
RUN npm install

# 3. Copy source code
COPY . .

# 4. Build the Next.js app
RUN npm run build

# 5. Expose port 3000
EXPOSE 3000

# 6. Start the app
CMD ["npm", "start"]