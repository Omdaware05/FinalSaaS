# FinalSaaS frontend — React + Vite, served by nginx
#
# IMPORTANT: no VITE_API_BASE_URL is set at build time (or runtime).
# The app calls the backend through RELATIVE paths (/api/v1/...), and
# nginx (see nginx.conf) proxies /api/ to the backend service. Baking an
# absolute localhost URL into the bundle would break the app for anyone
# opening it from another machine.

# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
