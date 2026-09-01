FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

RUN npm run build

FROM nginx:alpine

RUN apk add --no-cache jq

COPY --from=build /app/dist /usr/share/nginx/html
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.d/10-runtime-config.sh /docker-entrypoint.d/10-runtime-config.sh

RUN chmod 755 /docker-entrypoint.d/10-runtime-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
