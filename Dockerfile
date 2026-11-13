# Build stage
FROM node:22-alpine3.24@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build with placeholder values that will be replaced at runtime
ENV VITE_API_URL=VITE_API_URL_PLACEHOLDER
ENV VITE_AUTH_API_URL=VITE_AUTH_API_URL_PLACEHOLDER
ENV VITE_WS_URL=VITE_WS_URL_PLACEHOLDER
ENV VITE_EVOAI_API_URL=VITE_EVOAI_API_URL_PLACEHOLDER
ENV VITE_AGENT_PROCESSOR_URL=VITE_AGENT_PROCESSOR_URL_PLACEHOLDER
ENV VITE_EVOFLOW_API_URL=VITE_EVOFLOW_API_URL_PLACEHOLDER
ENV VITE_SEARCH_API_URL=VITE_SEARCH_API_URL_PLACEHOLDER

# App version (release tag, e.g. v1.0.0-rc3). Pass via:
#   docker build --build-arg APP_VERSION=$(git describe --tags --always --dirty) ...
# The .git directory is not copied into the build context, so vite.config.ts
# cannot run `git describe` from inside the container — the build-arg is the
# only signal. Falls back to 'dev' if not provided.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

# Build the application
RUN npm run build

# Production stage
FROM nginx:1.31.8-alpine3.24@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11

# Alpine v3.24 fixed the Trivy findings in libxslt at 1.1.43-r4.
RUN apk add --no-cache --upgrade 'libxslt=1.1.43-r4'

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN nginx -t

# Copy runtime entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
# Normalize CRLF->LF (defense in depth alongside .gitattributes): a Windows
# checkout leaves \r in the shebang (#!/bin/sh\r), making the kernel look for
# "/bin/sh\r" -> "exec: no such file or directory". See EVO-2020.
RUN sed -i 's/\r$//' /docker-entrypoint.sh \
    && chmod +x /docker-entrypoint.sh

# Expose port
EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
