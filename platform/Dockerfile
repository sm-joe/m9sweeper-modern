#####################
## STAGE 1 - BUILD ##
#####################
FROM node:22.22.3-bookworm-slim as builder

# Install Python3 used in dependencies for building
RUN apt update && \
    apt install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# BUILD BACK END
WORKDIR /usr/src/app/backend
COPY ./dash/backend/package.json /usr/src/app/backend
COPY ./dash/backend/package-lock.json /usr/src/app/backend
RUN mkdir /usr/src/app/backend/vendor
COPY ./dash/backend/vendor /usr/src/app/backend/vendor
RUN node --version && npm --version
# Keep Docker installs identical to the lockfile-generation policy used by
# the existing vendored packages. NestJS 11 and nest-winston are now compatible.
RUN npm ci --legacy-peer-deps --no-audit --no-fund && \
    chown -R root:root node_modules

COPY /dash/backend /usr/src/app/backend/
RUN npm run prebuild

RUN npm run build:prod:webpack
RUN npm prune --omit=dev --legacy-peer-deps --no-audit --no-fund

# manually install a couple npm packages
RUN rm -f node_modules/@nestjs-modules/mailer && rm -f node_modules/knexnest && \
  cp -r vendor/nestjs-mailer node_modules/@nestjs-modules/mailer && \
  cp -r vendor/knexnest node_modules/knexnest

############################
## STAGE 2 - ANGULAR SPA ##
############################
# Independent build stage: Angular cannot resolve imports from NestJS node_modules.
FROM node:22.22.3-bookworm-slim AS frontend-builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app/frontend
COPY ./dash/frontend/package.json ./dash/frontend/package-lock.json ./
COPY ./dash/frontend/vendor ./vendor
RUN npm ci --legacy-peer-deps --no-audit --no-fund
COPY ./dash/frontend ./
RUN test ! -d /usr/src/app/backend/node_modules && \
    npm run check:client-boundary && \
    npm run build:prod && \
    test -s /usr/src/app/backend/dist/public/index.html

######################
## Stage 3: DELIVER ##
######################
FROM node:22-alpine

# Node 22 is used by both the Angular build and NestJS runtime.
# Make the app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/backend/dist /usr/src/app
# Angular static assets come from the isolated frontend build stage. The
# backend retains dist/public/index.html as its existing SPA-serving contract.
COPY --from=frontend-builder /usr/src/app/backend/dist/public /usr/src/app/public
COPY --from=builder /usr/src/app/backend/node_modules /usr/src/app/node_modules
COPY --from=builder /usr/src/app/backend/vendor /usr/src/app/vendor

# Create non root user
RUN addgroup -g 1050 -S limitedaccessaccount && \
    adduser -u 1050 -S limitedaccessaccount -G limitedaccessaccount && \
    mkdir -p /usr/src/app/mnt/storage && \
    chown -R limitedaccessaccount:limitedaccessaccount /usr/src/app

# Set non root user
USER 1050

# Expose the port the dashboard is on
EXPOSE 3000

# Start the server
CMD [ "node", "main" ]
