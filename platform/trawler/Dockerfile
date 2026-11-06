# Build stage-1 - compile Java Code into native executable
FROM ghcr.io/graalvm/graalvm-ce:ol9-java17-22.3.3 as builder

RUN gu install native-image && java -version

WORKDIR /usr/app
COPY ./ /usr/app

RUN chmod +x mvnw && ./mvnw -version
RUN ./mvnw -Pnative package

RUN find /usr/app

# Build stage 2 -
FROM debian:bookworm-slim as runner

# Install Trivy
# Pinned, official Trivy scanner image. Do not execute a remote shell installer.
COPY --from=aquasec/trivy:0.76.2 /usr/local/bin/trivy /usr/local/bin/trivy
RUN /usr/local/bin/trivy --version

# Install
COPY --from=0 /usr/app/target/trawler /usr/local/bin/trawler

# Create non root user
RUN groupadd -g 1050 trawler && \
    useradd -u 1050 trawler -g trawler -m

# Set non root user
USER 1050
CMD ["trawler"]
