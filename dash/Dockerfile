FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json next-env.d.ts next.config.mjs ./
RUN npm install --no-audit --no-fund
COPY app ./app
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node","server.js"]
