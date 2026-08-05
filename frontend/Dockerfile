FROM nginx:alpine

# Copy pre-built static bundle into Nginx html directory
COPY dist /usr/share/nginx/html

# Add SPA fallback configuration for React Router / Vite
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
