FROM golang:1.25-alpine AS build

RUN apk add --no-cache ca-certificates git

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY docs ./docs
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/pulse ./internal/cmd

FROM alpine:3.21

RUN apk add --no-cache ca-certificates curl tzdata && \
    cp /usr/share/zoneinfo/UTC /etc/localtime && \
    echo "UTC" > /etc/timezone && \
    addgroup -g 1001 pulse && \
    adduser -D -u 1001 -G pulse pulse

WORKDIR /home/pulse

COPY --from=build /out/pulse ./pulse
COPY --from=build /src/docs ./docs
COPY --from=build /src/internal/config ./internal/config

RUN chown -R pulse:pulse /home/pulse

USER pulse

EXPOSE 8081

CMD ["./pulse"]
