FROM alpine:3.21

# Install prerequisites
RUN apk add --no-cache curl ca-certificates tzdata && \
    cp /usr/share/zoneinfo/UTC /etc/localtime && echo "UTC" > /etc/timezone && \
    addgroup -g 1001 pulse && \
    adduser -D -u 1001 -G pulse pulse

WORKDIR /home/pulse

# Copy pre-compiled Linux binary and docs
COPY pulse ./pulse
COPY docs ./docs

# Grant execute permissions & change ownership to non-root user
RUN chmod +x ./pulse && chown -R pulse:pulse /home/pulse

USER pulse

EXPOSE 8080

CMD ["./pulse", "server"]