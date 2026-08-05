FROM nginx:alpine

# Copy pre-built static bundle into Nginx html directory
COPY dist /usr/share/nginx/html

# Add Nginx config for HTTP and HTTPS SSL server
RUN echo 'server { \
    listen 80; \
    server_name pulse-crypto.duckdns.org localhost _; \
    location /.well-known/acme-challenge/ { \
        root /usr/share/nginx/html; \
    } \
    location /api/ { \
        proxy_pass http://pulse_app:8081; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
} \
server { \
    listen 443 ssl; \
    server_name pulse-crypto.duckdns.org; \
    ssl_certificate /etc/letsencrypt/live/pulse-crypto.duckdns.org/fullchain.pem; \
    ssl_certificate_key /etc/letsencrypt/live/pulse-crypto.duckdns.org/privkey.pem; \
    location /api/ { \
        proxy_pass http://pulse_app:8081; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
