FROM nginx:alpine

# Copy pre-built static bundle into Nginx html directory
COPY dist /usr/share/nginx/html

# Add SPA fallback & SSL configuration for React Router / Vite
RUN echo 'server { \
    listen 80; \
    server_name pulse-crypto.duckdns.org; \
    return 301 https://$host$request_uri; \
} \
server { \
    listen 443 ssl; \
    server_name pulse-crypto.duckdns.org; \
    ssl_certificate /etc/letsencrypt/live/pulse-crypto.duckdns.org/fullchain.pem; \
    ssl_certificate_key /etc/letsencrypt/live/pulse-crypto.duckdns.org/privkey.pem; \
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
