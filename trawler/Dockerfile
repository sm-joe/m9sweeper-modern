FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /trawler .

# Verified official Trivy image; pin an immutable digest for production.
FROM aquasec/trivy:0.76.0
COPY --from=build /trawler /usr/local/bin/m9-trawler
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/m9-trawler"]
