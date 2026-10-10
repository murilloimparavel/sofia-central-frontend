const KNOWN_PRODUCTION_HOSTS = new Set([
  'api-crm.caldasindica.com',
  'crm.caldasindica.com',
]);

/** Return true only for an explicit, syntactically valid HTTP(S) API base URL. */
export function hasExplicitApiUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (/placeholder|^undefined$/i.test(value.trim())) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname.length > 0 &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/**
 * This experimental profile requires an explicit allowlist. Unknown domains,
 * including production aliases, fail closed; only configured staging hosts or
 * loopback destinations are accepted.
 */
export function hasIsolatedCompatibilityApiConfig(
  apiUrl: unknown,
  authApiUrl: unknown,
  allowedHosts: string[] = [],
): boolean {
  const normalizedAllowedHosts = new Set(
    allowedHosts.map(host => host.toLowerCase().replace(/\.$/, '')),
  );

  return [apiUrl, authApiUrl].every(value => {
    if (!hasExplicitApiUrl(value)) return false;

    const hostname = new URL(value as string).hostname.toLowerCase().replace(/\.$/, '');
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (KNOWN_PRODUCTION_HOSTS.has(hostname)) return false;
    if (isLoopback) return true;

    const protocol = new URL(value as string).protocol;
    return protocol === 'https:' && normalizedAllowedHosts.has(hostname);
  });
}

/** Optional service origins are accepted only when absent or explicitly allowed. */
export function isOptionalEndpointAllowed(value: unknown, allowedHosts: string[]): boolean {
  if (value === undefined || value === '') return true;
  return hasIsolatedCompatibilityApiConfig(value, value, allowedHosts);
}

/**
 * The existing connectors accept either an HTTP(S) base URL and derive the
 * WebSocket scheme, or an explicit WS(S) URL. Permit insecure schemes only on
 * loopback; remote origins must use HTTPS/WSS and be explicitly allowlisted.
 */
export function isOptionalWebSocketEndpointAllowed(value: unknown, allowedHosts: string[]): boolean {
  if (value === undefined || value === '') return true;
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (/placeholder|^undefined$/i.test(value.trim())) return false;

  // The canonical workspace deployment sets VITE_WS_URL to the HTTPS API
  // origin; its ActionCable connector derives wss:// from that value.
  if (hasExplicitApiUrl(value)) return isOptionalEndpointAllowed(value, allowedHosts);

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const normalizedAllowedHosts = new Set(
      allowedHosts.map(host => host.toLowerCase().replace(/\.$/, '')),
    );
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

    if (!hostname || url.username || url.password || KNOWN_PRODUCTION_HOSTS.has(hostname)) return false;
    if (url.protocol === 'ws:' && isLoopback) return true;
    if (url.protocol !== 'wss:') return false;

    return isLoopback || normalizedAllowedHosts.has(hostname);
  } catch {
    return false;
  }
}

/** Parse a comma-separated build allowlist, trimming whitespace and empty items. */
export function parseCompatibilityAllowedHosts(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(',').map(host => host.trim()).filter(Boolean);
}
