FROM golang:alpine AS builder

WORKDIR /app

ENV GOTOOLCHAIN=auto
ENV CGO_ENABLED=0

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build binary without CGO and with -p 2 concurrency to prevent memory thrashing
RUN go build -p 2 -ldflags "-s -w" -o pulse ./internal/cmd/main.go

# --- Runtime Stage ---
FROM alpine:3.21

RUN apk add --no-cache curl ca-certificates tzdata && \
    cp /usr/share/zoneinfo/UTC /etc/localtime && echo "UTC" > /etc/timezone && \
    addgroup -g 1001 pulse && \
    adduser -D -u 1001 -G pulse pulse

WORKDIR /home/pulse

COPY --from=builder /app/pulse ./pulse
COPY --from=builder /app/docs ./docs

RUN chown -R pulse:pulse /home/pulse

USER pulse

EXPOSE 8080

CMD ["./pulse", "server"]