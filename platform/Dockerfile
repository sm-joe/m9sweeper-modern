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

# BUILD FRONT END
WORKDIR /usr/src/app/frontend
COPY ./dash/frontend/package.json /usr/src/app/frontend
COPY ./dash/frontend/package-lock.json /usr/src/app/frontend
COPY ./dash/frontend/vendor /usr/src/app/frontend/vendor
# Legacy AJSF and Flex Layout still require a temporary peer-resolution policy.
# Remove it only after replacement forms and responsive layouts pass regression.
RUN npm ci --legacy-peer-deps --no-audit --no-fund && \
    chown -R root:root node_modules

WORKDIR /usr/src/app
COPY ./dash/frontend /usr/src/app/frontend

WORKDIR /usr/src/app/frontend
RUN npm run build:prod
# Use the same legacy peer-resolution policy as npm ci. npm prune
# re-resolves the AJSF/Flex Layout peer graph otherwise and fails the image.
RUN npm prune --omit=dev --legacy-peer-deps --no-audit --no-fund

#########################
## Stage 2: Build Docs ##
#########################
FROM klakegg/hugo:0.111.3-ext-ubuntu as docs-builder
RUN git config --global --add safe.directory /src

WORKDIR /usr/src/

COPY ./docs/ /usr/src/


RUN hugo --config config-local.toml


######################
## Stage 3: DELIVER ##
######################
FROM node:22-alpine

# Node 22 is used by both the Angular build and NestJS runtime.
# Make the app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/backend/dist /usr/src/app
COPY --from=builder /usr/src/app/backend/node_modules /usr/src/app/node_modules
COPY --from=builder /usr/src/app/backend/vendor /usr/src/app/vendor
COPY --from=docs-builder /usr/src/public /usr/src/app/public/docs

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
