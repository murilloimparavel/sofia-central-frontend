import { describe, expect, it } from 'vitest';
import {
  hasExplicitApiUrl,
  hasIsolatedCompatibilityApiConfig,
  isOptionalEndpointAllowed,
  isOptionalWebSocketEndpointAllowed,
  parseCompatibilityAllowedHosts,
} from './compatibilityApiConfig';

describe('hasExplicitApiUrl', () => {
  it.each([
    undefined,
    null,
    '',
    '  ',
    'undefined',
    'VITE_API_URL_PLACEHOLDER',
    'vite_api_url_placeholder',
    'ftp://api.example.test',
    'https://user:password@api.example.test',
    'https://not a valid host',
  ]) (
    'rejects missing or unsupported URL value %s', (value) => {
      expect(hasExplicitApiUrl(value)).toBe(false);
    },
  );

  it.each(['https://api.example.test', 'http://127.0.0.1:3030', 'https://api.example.test/v1']) (
    'accepts explicit HTTP(S) URL %s', (value) => {
      expect(hasExplicitApiUrl(value)).toBe(true);
    },
  );
});

describe('hasIsolatedCompatibilityApiConfig', () => {
  it('accepts two explicitly configured local or staging API URLs', () => {
    expect(
      hasIsolatedCompatibilityApiConfig(
        'https://crm-api.staging.example.test',
        'https://auth.staging.example.test',
        ['crm-api.staging.example.test', 'auth.staging.example.test'],
      ),
    ).toBe(true);
    expect(
      hasIsolatedCompatibilityApiConfig('http://127.0.0.1:3030', 'http://127.0.0.1:3001'),
    ).toBe(true);
  });

  it.each([
    ['https://api-crm.caldasindica.com', 'https://auth.staging.example.test'],
    ['https://crm-api.staging.example.test', 'https://crm.caldasindica.com/'],
    ['https://API-CRM.CALDASINDICA.COM./api/v1', 'https://auth.staging.example.test'],
    ['https://unknown-production-alias.example.com', 'https://auth.staging.example.test'],
  ])('rejects any URL whose host is not explicitly allowed: %s', (apiUrl, authApiUrl) => {
    expect(hasIsolatedCompatibilityApiConfig(apiUrl, authApiUrl)).toBe(false);
  });

  it('never allows known production hosts, even if they appear in the allowlist', () => {
    expect(
      hasIsolatedCompatibilityApiConfig(
        'https://api-crm.caldasindica.com',
        'https://auth.staging.example.test',
        ['api-crm.caldasindica.com', 'auth.staging.example.test'],
      ),
    ).toBe(false);
  });

  it('requires HTTPS for remote allowlisted hosts while retaining HTTP loopback', () => {
    expect(
      hasIsolatedCompatibilityApiConfig(
        'http://crm-api.staging.example.test',
        'https://auth.staging.example.test',
        ['crm-api.staging.example.test', 'auth.staging.example.test'],
      ),
    ).toBe(false);
    expect(
      hasIsolatedCompatibilityApiConfig(
        'http://127.0.0.1:3000',
        'http://localhost:3030',
      ),
    ).toBe(true);
  });

  it('normalizes allowed host casing and trailing dots', () => {
    expect(
      hasIsolatedCompatibilityApiConfig(
        'https://API.STAGING.EXAMPLE.TEST./api/v1',
        'https://AUTH.STAGING.EXAMPLE.TEST',
        ['api.staging.example.test', 'auth.staging.example.test'],
      ),
    ).toBe(true);
  });

  it('rejects a configuration when either URL is absent or invalid', () => {
    expect(hasIsolatedCompatibilityApiConfig('https://api.staging.example.test', '')).toBe(false);
    expect(hasIsolatedCompatibilityApiConfig(undefined, 'https://auth.staging.example.test')).toBe(false);
  });

  it('accepts an optional endpoint only when it is absent or in the same allowed set', () => {
    expect(isOptionalEndpointAllowed(undefined, [])).toBe(true);
    expect(isOptionalEndpointAllowed('', [])).toBe(true);
    expect(isOptionalEndpointAllowed('https://ai.staging.example.test', [])).toBe(false);
    expect(
      isOptionalEndpointAllowed('https://ai.staging.example.test', ['ai.staging.example.test']),
    ).toBe(true);
  });

  it('parses a comma-separated allowlist and rejects missing values', () => {
    expect(parseCompatibilityAllowedHosts(' crm.test, , auth.test ')).toEqual(['crm.test', 'auth.test']);
    expect(parseCompatibilityAllowedHosts(undefined)).toEqual([]);
  });
});

describe('isOptionalWebSocketEndpointAllowed', () => {
  it('allows an absent endpoint and loopback ws origins for local fixtures', () => {
    expect(isOptionalWebSocketEndpointAllowed(undefined, [])).toBe(true);
    expect(isOptionalWebSocketEndpointAllowed('ws://127.0.0.1:3030/cable', [])).toBe(true);
    expect(isOptionalWebSocketEndpointAllowed('ws://localhost:3030/cable', [])).toBe(true);
    expect(isOptionalWebSocketEndpointAllowed('http://127.0.0.1:3030', [])).toBe(true);
  });

  it('allows wss origins only for loopback or an explicitly allowlisted staging host', () => {
    expect(isOptionalWebSocketEndpointAllowed('wss://127.0.0.1:3030/cable', [])).toBe(true);
    expect(
      isOptionalWebSocketEndpointAllowed(
        'https://crm.staging.example.test',
        ['crm.staging.example.test'],
      ),
    ).toBe(true);
    expect(
      isOptionalWebSocketEndpointAllowed(
        'wss://cable.staging.example.test/cable',
        ['cable.staging.example.test'],
      ),
    ).toBe(true);
    expect(isOptionalWebSocketEndpointAllowed('wss://unknown.example.test/cable', [])).toBe(false);
  });

  it('rejects remote insecure ws, production hosts, credentials and non-WebSocket schemes', () => {
    expect(
      isOptionalWebSocketEndpointAllowed(
        'ws://cable.staging.example.test/cable',
        ['cable.staging.example.test'],
      ),
    ).toBe(false);
    expect(
      isOptionalWebSocketEndpointAllowed(
        'wss://api-crm.caldasindica.com/cable',
        ['api-crm.caldasindica.com'],
      ),
    ).toBe(false);
    expect(isOptionalWebSocketEndpointAllowed('wss://user:pass@cable.staging.example.test', ['cable.staging.example.test'])).toBe(false);
    expect(isOptionalWebSocketEndpointAllowed('http://cable.staging.example.test', ['cable.staging.example.test'])).toBe(false);
  });
});
