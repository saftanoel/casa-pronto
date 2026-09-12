import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResolvingMetadata } from 'next';
import PropertyPage, { generateMetadata } from '../page';
import * as wpApi from '@/lib/api/wordpress';
import { Property } from '@/data/properties';
import * as nextNavigation from 'next/navigation';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    const err = new Error('NEXT_NOT_FOUND') as Error & { digest: string };
    err.digest = 'NEXT_NOT_FOUND';
    throw err;
  }),
}));

const mockResolvingMetadata = Promise.resolve({}) as unknown as ResolvingMetadata;

describe('Property detail route - SEO false-404 regression tests', () => {
  const mockProperty: Property = {
    id: 1234,
    title: 'Vila Moderna Alba Iulia',
    description: 'Vila superba de vanzare',
    price: '150.000 €',
    priceValue: 150000,
    location: 'Cetate, Alba Iulia',
    zone: 'cetate',
    type: 'Vânzare',
    propertyType: 'vile',
    beds: 4,
    baths: 3,
    area: 200,
    image: 'https://casapronto.ro/vila.jpg',
    images: ['https://casapronto.ro/vila.jpg'],
    features: ['Centrală termică', 'Garaj'],
    agent: 'Casa Pronto',
    isNew: false,
    seo: {
      title: 'Vila Moderna de Vanzare Alba Iulia',
      description: 'Vila de lux in Cetate',
      canonical_url: 'https://casapronto.ro/proprietate/1234',
      og_image: 'https://casapronto.ro/vila.jpg',
      og_title: 'Vila Moderna de Vanzare Alba Iulia',
      og_description: 'Vila de lux in Cetate',
      noindex: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('VALID PROPERTY: generateMetadata returns property metadata and PropertyPage renders', async () => {
    vi.spyOn(wpApi, 'fetchPropertyById').mockResolvedValue(mockProperty);

    const metadata = await generateMetadata(
      { params: Promise.resolve({ id: '1234' }) },
      mockResolvingMetadata
    );
    expect(metadata.title).toBe('Vila Moderna de Vanzare Alba Iulia');
    expect(metadata.description).toBe('Vila de lux in Cetate');

    const jsx = await PropertyPage({ params: Promise.resolve({ id: '1234' }) });
    expect(jsx).toBeDefined();
    expect(nextNavigation.notFound).not.toHaveBeenCalled();
  });

  it('GENUINELY MISSING PROPERTY (WordPress 404): PropertyPage triggers notFound() and generateMetadata returns not found title', async () => {
    vi.spyOn(wpApi, 'fetchPropertyById').mockResolvedValue(null);

    const metadata = await generateMetadata(
      { params: Promise.resolve({ id: '9999' }) },
      mockResolvingMetadata
    );
    expect(metadata.title).toBe('Property Not Found');

    await expect(
      PropertyPage({ params: Promise.resolve({ id: '9999' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(nextNavigation.notFound).toHaveBeenCalledTimes(1);
  });

  it('UPSTREAM FAILURE 429: generateMetadata throws and PropertyPage throws (NEVER calls notFound)', async () => {
    const error429 = new wpApi.WordPressApiError(429, 'property', 'HTTP 429 Too Many Requests');
    vi.spyOn(wpApi, 'fetchPropertyById').mockRejectedValue(error429);

    await expect(
      generateMetadata({ params: Promise.resolve({ id: '1234' }) }, mockResolvingMetadata)
    ).rejects.toThrow(wpApi.WordPressApiError);

    await expect(
      PropertyPage({ params: Promise.resolve({ id: '1234' }) })
    ).rejects.toThrow(wpApi.WordPressApiError);

    // CRITICAL SEO ASSERTION: notFound() must NEVER be called on upstream 429
    expect(nextNavigation.notFound).not.toHaveBeenCalled();
  });

  it('UPSTREAM FAILURE 500: generateMetadata throws and PropertyPage throws (NEVER calls notFound)', async () => {
    const error500 = new wpApi.WordPressApiError(500, 'property', 'HTTP 500 Internal Server Error');
    vi.spyOn(wpApi, 'fetchPropertyById').mockRejectedValue(error500);

    await expect(
      generateMetadata({ params: Promise.resolve({ id: '1234' }) }, mockResolvingMetadata)
    ).rejects.toThrow(wpApi.WordPressApiError);

    await expect(
      PropertyPage({ params: Promise.resolve({ id: '1234' }) })
    ).rejects.toThrow(wpApi.WordPressApiError);

    // CRITICAL SEO ASSERTION: notFound() must NEVER be called on upstream 500
    expect(nextNavigation.notFound).not.toHaveBeenCalled();
  });

  it('UPSTREAM FAILURE 503: generateMetadata throws and PropertyPage throws (NEVER calls notFound)', async () => {
    const error503 = new wpApi.WordPressApiError(503, 'property', 'HTTP 503 Service Unavailable');
    vi.spyOn(wpApi, 'fetchPropertyById').mockRejectedValue(error503);

    await expect(
      generateMetadata({ params: Promise.resolve({ id: '1234' }) }, mockResolvingMetadata)
    ).rejects.toThrow(wpApi.WordPressApiError);

    await expect(
      PropertyPage({ params: Promise.resolve({ id: '1234' }) })
    ).rejects.toThrow(wpApi.WordPressApiError);

    // CRITICAL SEO ASSERTION: notFound() must NEVER be called on upstream 503
    expect(nextNavigation.notFound).not.toHaveBeenCalled();
  });

  it('NETWORK FAILURE: generateMetadata throws and PropertyPage throws (NEVER calls notFound)', async () => {
    const netErr = new TypeError('fetch failed: ECONNRESET');
    vi.spyOn(wpApi, 'fetchPropertyById').mockRejectedValue(netErr);

    await expect(
      generateMetadata({ params: Promise.resolve({ id: '1234' }) }, mockResolvingMetadata)
    ).rejects.toThrow('fetch failed: ECONNRESET');

    await expect(
      PropertyPage({ params: Promise.resolve({ id: '1234' }) })
    ).rejects.toThrow('fetch failed: ECONNRESET');

    // CRITICAL SEO ASSERTION: notFound() must NEVER be called on network failure
    expect(nextNavigation.notFound).not.toHaveBeenCalled();
  });

  describe('Invalid Route ID handling (zero WordPress requests & local 404)', () => {
    const invalidIds = ['foo', '123abc', '0', '-1', '1.5'];

    invalidIds.forEach((invalidId) => {
      it(`INVALID ID "${invalidId}": generateMetadata calls notFound() and never calls fetchPropertyById`, async () => {
        const fetchSpy = vi.spyOn(wpApi, 'fetchPropertyById');

        await expect(
          generateMetadata({ params: Promise.resolve({ id: invalidId }) }, mockResolvingMetadata)
        ).rejects.toThrow('NEXT_NOT_FOUND');

        expect(nextNavigation.notFound).toHaveBeenCalledTimes(1);
        expect(fetchSpy).not.toHaveBeenCalled();
      });

      it(`INVALID ID "${invalidId}": PropertyPage calls notFound() and never calls fetchPropertyById`, async () => {
        const fetchSpy = vi.spyOn(wpApi, 'fetchPropertyById');

        await expect(
          PropertyPage({ params: Promise.resolve({ id: invalidId }) })
        ).rejects.toThrow('NEXT_NOT_FOUND');

        expect(nextNavigation.notFound).toHaveBeenCalledTimes(1);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });

    it('VALID NUMERIC STRING "1234": passes validation and calls fetchPropertyById with numeric 1234', async () => {
      const fetchSpy = vi.spyOn(wpApi, 'fetchPropertyById').mockResolvedValue(mockProperty);

      await generateMetadata({ params: Promise.resolve({ id: '1234' }) }, mockResolvingMetadata);
      expect(fetchSpy).toHaveBeenCalledWith(1234);

      await PropertyPage({ params: Promise.resolve({ id: '1234' }) });
      expect(fetchSpy).toHaveBeenCalledWith(1234);
    });
  });
});
