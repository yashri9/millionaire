# Container deploy (Render / Railway / Fly.io / DO App Platform).
# Includes LibreOffice so PPTX uploads render full slide images in production.
FROM node:20-slim

RUN apt-get update \
  && apt-get install -y libreoffice --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
