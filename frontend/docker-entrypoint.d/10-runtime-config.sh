#!/bin/sh
set -eu

: "${VITE_BINANCE_WS_URL:?VITE_BINANCE_WS_URL must be set}"
: "${VITE_BINANCE_REST_BASE_URL:?VITE_BINANCE_REST_BASE_URL must be set}"
: "${VITE_FIREBASE_API_KEY:?VITE_FIREBASE_API_KEY must be set}"
: "${VITE_FIREBASE_AUTH_DOMAIN:?VITE_FIREBASE_AUTH_DOMAIN must be set}"
: "${VITE_FIREBASE_PROJECT_ID:?VITE_FIREBASE_PROJECT_ID must be set}"
: "${VITE_FIREBASE_STORAGE_BUCKET:?VITE_FIREBASE_STORAGE_BUCKET must be set}"
: "${VITE_FIREBASE_MESSAGING_SENDER_ID:?VITE_FIREBASE_MESSAGING_SENDER_ID must be set}"
: "${VITE_FIREBASE_APP_ID:?VITE_FIREBASE_APP_ID must be set}"
: "${VITE_FIREBASE_FIRESTORE_DATABASE_ID:?VITE_FIREBASE_FIRESTORE_DATABASE_ID must be set}"

runtime_config="$(jq -cn \
  --arg api_base_url "${VITE_API_BASE_URL:-}" \
  --arg app_url "${VITE_APP_URL:-}" \
  --arg binance_ws_url "$VITE_BINANCE_WS_URL" \
  --arg binance_rest_base_url "$VITE_BINANCE_REST_BASE_URL" \
  --arg firebase_api_key "$VITE_FIREBASE_API_KEY" \
  --arg firebase_auth_domain "$VITE_FIREBASE_AUTH_DOMAIN" \
  --arg firebase_project_id "$VITE_FIREBASE_PROJECT_ID" \
  --arg firebase_storage_bucket "$VITE_FIREBASE_STORAGE_BUCKET" \
  --arg firebase_messaging_sender_id "$VITE_FIREBASE_MESSAGING_SENDER_ID" \
  --arg firebase_app_id "$VITE_FIREBASE_APP_ID" \
  --arg firebase_firestore_database_id "$VITE_FIREBASE_FIRESTORE_DATABASE_ID" \
  --arg firebase_vapid_key "${VITE_FIREBASE_VAPID_KEY:-}" \
  --arg demo_mode "${VITE_DEMO_MODE:-false}" \
  '{
    VITE_API_BASE_URL: $api_base_url,
    VITE_APP_URL: $app_url,
    VITE_BINANCE_WS_URL: $binance_ws_url,
    VITE_BINANCE_REST_BASE_URL: $binance_rest_base_url,
    VITE_FIREBASE_API_KEY: $firebase_api_key,
    VITE_FIREBASE_AUTH_DOMAIN: $firebase_auth_domain,
    VITE_FIREBASE_PROJECT_ID: $firebase_project_id,
    VITE_FIREBASE_STORAGE_BUCKET: $firebase_storage_bucket,
    VITE_FIREBASE_MESSAGING_SENDER_ID: $firebase_messaging_sender_id,
    VITE_FIREBASE_APP_ID: $firebase_app_id,
    VITE_FIREBASE_FIRESTORE_DATABASE_ID: $firebase_firestore_database_id,
    VITE_FIREBASE_VAPID_KEY: $firebase_vapid_key,
    VITE_DEMO_MODE: $demo_mode
  }')"

printf 'window.__PULSE_CONFIG__ = Object.freeze(%s);\n' "$runtime_config" \
  > /usr/share/nginx/html/runtime-config.js

