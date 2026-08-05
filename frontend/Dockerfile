FROM nginx:alpine

# Copy pre-built static bundle into Nginx html directory
COPY dist /usr/share/nginx/html

# Add Nginx config for HTTP and ACME challenge fallback
RUN echo 'server { \
    listen 80; \
    server_name pulse-crypto.duckdns.org localhost _; \
    location /.well-known/acme-challenge/ { \
        root /usr/share/nginx/html; \
    } \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass http://pulse_app:8081/api/; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
