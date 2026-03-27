FROM node:22-alpine AS frontend-build
WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# DEBUG (opcional, mas útil)
RUN ls -la dist

FROM node:22-alpine AS runtime
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./src

# GARANTE criação da pasta
RUN mkdir -p public

COPY --from=frontend-build /frontend/dist ./public

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "src/index.js"]