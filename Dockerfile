# Backend image: the WebSocket simulator. The frontend is a static site and is not in this image.
FROM node:24-alpine AS build
WORKDIR /app
ENV NX_DAEMON=false
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx nx run backend:build

# Last stage, so a plain `docker build` (what Render runs) produces this one.
FROM node:24-alpine AS backend
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/backend/src/server.js"]
