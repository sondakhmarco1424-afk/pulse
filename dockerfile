FROM golang:alpine AS builder

# Install Git (required for fetching dependencies via Git URLs)
# Install ca-certificates to ensure SSL connections work during dependency fetching
RUN apk add --no-cache git ca-certificates

WORKDIR /app

ENV GOTOOLCHAIN=auto

# Copy go.mod and go.sum first to leverage Docker layer caching
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy the rest of the source code
COPY . .

# Set build arguments for versioning
ARG APP_VERSION=1.0.0
ARG Git_COMMIT

ENV CGO_ENABLED=0

# Build the binary with restricted concurrency (-p 2) to prevent RAM/swap thrashing on t3.micro
RUN go build -p 2 -ldflags "-X 'pulse/internal/config.Version=$APP_VERSION' -X 'pulse/internal/config.GitCommit=$Git_COMMIT' -X 'pulse/internal/config.BuildDate=$(date +%FT%T%z)' -s -w" -o pulse ./internal/cmd/main.go

# --- Runtime Stage ---
FROM alpine:3.21 AS runtime

# Install curl (needed for HTTP health checks) and ca-certificates (for HTTPS)
# Switch to a non-root user for security best practices
RUN apk add --no-cache curl ca-certificates tzdata

# Set timezone to UTC for consistency
RUN cp /usr/share/zoneinfo/UTC /etc/localtime && echo "UTC" > /etc/timezone

# Create non-root user
RUN addgroup -g 1001 pulse && \
    adduser -D -u 1001 -G pulse pulse

WORKDIR /home/pulse

# Copy the compiled binary from the builder stage
COPY --from=builder /app/pulse ./pulse

# Copy the generated docs package from the builder stage
# Note: Ensure the docs package is copied to a location where the controller expects it.
# If the controller expects it in /app/docs, you might need an intermediate stage or change the copy path.
# Assuming docs are in /app/docs in builder:
COPY --from=builder /app/docs ./docs

# Copy config directory from builder if it exists (good practice, though YAML is often mounted)
COPY --from=builder --chown=pulse:pulse /app/config ./config

# Change ownership of the working directory to the non-root user
RUN chown -R pulse:pulse /home/pulse

USER pulse

EXPOSE 8080

# Start the application
CMD ["./pulse", "server"]