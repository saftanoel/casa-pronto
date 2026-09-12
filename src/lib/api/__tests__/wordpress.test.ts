import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPropertyById, WordPressApiError, WPPost } from '../wordpress';

const mockWPPost: WPPost = {
  id: 1234,
  date: '2026-01-01T12:00:00',
  title: { rendered: 'Apartament 2 camere Alba Iulia' },
  content: { rendered: '<p>Descriere detaliată a proprietății.</p>' },
  featured_media: 101,
  gallery_urls: ['https://casapronto.ro/uploads/img1.jpg'],
  property_details: {
    price: '75000',
    bedrooms: 2,
    bathrooms: 1,
    area: 60,
  },
  taxonomies: {
    property_type: ['apartamente'],
    property_status: ['vanzare'],
    property_city: ['alba-iulia'],
  },
  seo: {
    title: 'Apartament 2 camere de vânzare Alba Iulia',
    description: 'Apartament modern în Alba Iulia',
    canonical_url: 'https://casapronto.ro/proprietate/1234',
    noindex: false,
  },
};

describe('fetchPropertyById - HTTP Error Semantics & SEO Regression Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // TEST A — WordPress 200
  it('TEST A: WordPress 200 returns a valid mapped Property object', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockWPPost,
    } as unknown as Response);

    const result = await fetchPropertyById(1234);

    expect(result).not.toBeNull();
    expect(result?.title).toBe('Apartament 2 camere Alba Iulia');
    expect(result?.beds).toBe(2);
    expect(result?.baths).toBe(1);
    expect(result?.area).toBe(60);
    expect(result?.price).toContain('75.000');
  });

  // TEST B — WordPress 404
  it('TEST B: WordPress 404 returns null (genuine missing property)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ code: 'not_found', message: 'Anunțul nu a fost găsit' }),
    } as unknown as Response);

    const result = await fetchPropertyById(9999);

    expect(result).toBeNull();
  });

  // TEST C — WordPress 429
  it('TEST C: WordPress 429 throws WordPressApiError and MUST NOT return null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Too Many Requests' }),
    } as unknown as Response);

    await expect(fetchPropertyById(1234)).rejects.toThrow(WordPressApiError);
    await expect(fetchPropertyById(1234)).rejects.toThrow(/HTTP 429/);

    try {
      await fetchPropertyById(1234);
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(WordPressApiError);
      const apiErr = err as WordPressApiError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.isRetryable).toBe(true);
      expect(apiErr.endpoint).toBe('property');
    }
  });

  // TEST D — WordPress 500
  it('TEST D: WordPress 500 throws WordPressApiError and MUST NOT return null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ code: 'internal_server_error' }),
    } as unknown as Response);

    await expect(fetchPropertyById(1234)).rejects.toThrow(WordPressApiError);
    await expect(fetchPropertyById(1234)).rejects.toThrow(/HTTP 500/);

    try {
      await fetchPropertyById(1234);
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(WordPressApiError);
      const apiErr = err as WordPressApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.isRetryable).toBe(true);
    }
  });

  // TEST E — WordPress 503
  it('TEST E: WordPress 503 throws WordPressApiError and MUST NOT return null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'Service Unavailable' }),
    } as unknown as Response);

    await expect(fetchPropertyById(1234)).rejects.toThrow(WordPressApiError);
    await expect(fetchPropertyById(1234)).rejects.toThrow(/HTTP 503/);

    try {
      await fetchPropertyById(1234);
      expect.unreachable('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(WordPressApiError);
      const apiErr = err as WordPressApiError;
      expect(apiErr.status).toBe(503);
      expect(apiErr.isRetryable).toBe(true);
    }
  });

  // TEST F — Network failure
  it('TEST F: Network failure (DNS/connection reset) propagates and MUST NOT return null', async () => {
    const networkError = new TypeError('fetch failed: ECONNREFUSED');
    globalThis.fetch = vi.fn().mockRejectedValue(networkError);

    await expect(fetchPropertyById(1234)).rejects.toThrow('fetch failed: ECONNREFUSED');
    await expect(fetchPropertyById(1234)).rejects.toThrow(TypeError);
  });

  // TEST G — Malformed JSON
  it('TEST G: Malformed JSON on HTTP 200 propagates parsing error and MUST NOT return null', async () => {
    const jsonSyntaxError = new SyntaxError('Unexpected token < in JSON at position 0');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw jsonSyntaxError;
      },
    } as unknown as Response);

    await expect(fetchPropertyById(1234)).rejects.toThrow(SyntaxError);
    await expect(fetchPropertyById(1234)).rejects.toThrow(/Unexpected token/);
  });

  // Additional status codes
  it('HTTP 502 Bad Gateway throws retryable WordPressApiError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ message: 'Bad Gateway' }),
    } as unknown as Response);

    await expect(fetchPropertyById(1234)).rejects.toThrow(WordPressApiError);
    try {
      await fetchPropertyById(1234);
    } catch (err: unknown) {
      const apiErr = err as WordPressApiError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.isRetryable).toBe(true);
    }
  });

  it('HTTP 403 Forbidden throws non-retryable WordPressApiError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    } as unknown as Response);

    await expect(fetchPropertyById(1234)).rejects.toThrow(WordPressApiError);
    try {
      await fetchPropertyById(1234);
    } catch (err: unknown) {
      const apiErr = err as WordPressApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.isRetryable).toBe(false);
    }
  });
});
