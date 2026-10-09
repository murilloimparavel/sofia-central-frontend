#!/bin/sh
set -e

# =============================================================================
# Runtime environment variable injection for Vite-built apps
# =============================================================================
# Replaces placeholder values in the built JS files with actual environment
# variables at container startup, enabling runtime configuration without
# rebuilding the image.
# =============================================================================

HTML_DIR="/usr/share/nginx/html"
NGINX_CONF="/etc/nginx/conf.d/default.conf"

# Replace VITE_* variables in all JS files
# The build uses empty strings or defaults — we replace them at runtime
for file in $(find "$HTML_DIR" -name '*.js' -type f); do
  # Replace each VITE_* env var if set
  [ -n "$VITE_API_URL" ] && sed -i "s|VITE_API_URL_PLACEHOLDER|${VITE_API_URL}|g" "$file"
  [ -n "$VITE_AUTH_API_URL" ] && sed -i "s|VITE_AUTH_API_URL_PLACEHOLDER|${VITE_AUTH_API_URL}|g" "$file"
  [ -n "$VITE_WS_URL" ] && sed -i "s|VITE_WS_URL_PLACEHOLDER|${VITE_WS_URL}|g" "$file"
  [ -n "$VITE_EVOAI_API_URL" ] && sed -i "s|VITE_EVOAI_API_URL_PLACEHOLDER|${VITE_EVOAI_API_URL}|g" "$file"
  [ -n "$VITE_AGENT_PROCESSOR_URL" ] && sed -i "s|VITE_AGENT_PROCESSOR_URL_PLACEHOLDER|${VITE_AGENT_PROCESSOR_URL}|g" "$file"
  [ -n "$VITE_EVOFLOW_API_URL" ] && sed -i "s|VITE_EVOFLOW_API_URL_PLACEHOLDER|${VITE_EVOFLOW_API_URL}|g" "$file"
done

# The assistant is hosted separately. Keep its address configurable at runtime,
# but only allow HTTPS and inject only its origin into the browser's frame CSP.
ASSISTANT_URL="${VITE_COMMERCIAL_ASSISTANT_URL:-}"
ASSISTANT_ORIGIN=""
if [ -n "$ASSISTANT_URL" ]; then
  case "$ASSISTANT_URL" in
    https://*) ;;
    *) echo "VITE_COMMERCIAL_ASSISTANT_URL must use HTTPS." >&2; exit 1 ;;
  esac
  ASSISTANT_ORIGIN="$(printf '%s' "$ASSISTANT_URL" | sed -E 's#^(https://[^/]+).*$#\1#')"
  case "$ASSISTANT_ORIGIN" in
    https://*.*) ;;
    *) echo "VITE_COMMERCIAL_ASSISTANT_URL must contain a valid HTTPS host." >&2; exit 1 ;;
  esac
  case "$ASSISTANT_ORIGIN" in
    *[!A-Za-z0-9.:-]*) echo "VITE_COMMERCIAL_ASSISTANT_URL must use a plain HTTPS origin." >&2; exit 1 ;;
  esac
  case "$ASSISTANT_URL" in
    "$ASSISTANT_ORIGIN"|"$ASSISTANT_ORIGIN"/) ;;
    *) echo "VITE_COMMERCIAL_ASSISTANT_URL must be an origin without a path, query, or credentials." >&2; exit 1 ;;
  esac
fi

for file in $(find "$HTML_DIR" -name '*.js' -type f); do
  sed -i "s|VITE_COMMERCIAL_ASSISTANT_URL_PLACEHOLDER|${ASSISTANT_URL}|g" "$file"
done
sed -i "s|COMMERCIAL_ASSISTANT_ORIGIN_PLACEHOLDER|${ASSISTANT_ORIGIN}|g" "$NGINX_CONF"

# Configure nginx CSP based on environment (default: development)
# The CSP shipped in nginx.conf is the production default: img-src/media-src
# allow 'https:' (external buckets) but no plain-http origin. Chat media served
# by the backend (ActiveStorage local disk) comes from the API origin, which is
# plain http in development and in self-hosted deploys without TLS — without
# the adjustments below the browser blocks images/audio in the chat (EVO-1961).
# All substitutions are anchored on the trailing ';' or guarded so a container
# restart does not append the same source twice.
APP_ENV="${VITE_APP_ENV:-development}"

if [ "$APP_ENV" = "development" ]; then
  # Development: allow localhost (any port) for API calls and for media served
  # by the backend, and permissive frame-ancestors for the widget.
  sed -i \
    -e "s|connect-src 'self' blob: https: wss: ws:;|connect-src 'self' blob: https: wss: ws: http://localhost:*;|" \
    -e "s|img-src 'self' data: blob: https:;|img-src 'self' data: blob: https: http://localhost:*;|" \
    -e "s|media-src 'self' blob: https:;|media-src 'self' blob: https: http://localhost:*;|" \
    -e "s|frame-ancestors 'self';|frame-ancestors *;|" \
    "$NGINX_CONF"
fi

# Self-hosted over plain http (no TLS): media and API calls come from the API
# origin and 'https:' does not cover http origins, so allow it explicitly.
case "$VITE_API_URL" in
  http://*)
    API_ORIGIN="$(printf '%s' "$VITE_API_URL" | sed "s|^\(http://[^/]*\).*|\1|")"
    if ! grep -q "img-src[^;]* $API_ORIGIN" "$NGINX_CONF"; then
      sed -i \
        -e "s|\(img-src [^;]*\);|\1 ${API_ORIGIN};|" \
        -e "s|\(media-src [^;]*\);|\1 ${API_ORIGIN};|" \
        -e "s|\(connect-src [^;]*\);|\1 ${API_ORIGIN};|" \
        "$NGINX_CONF"
    fi
    ;;
esac


exec "$@"
