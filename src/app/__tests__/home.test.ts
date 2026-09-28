import { describe, it, expect } from 'vitest';
import { metadata as homeMetadata } from '../page';
import { metadata as rootMetadata } from '../layout';
import { SITE_URL } from '@/lib/constants';

describe('Site Canonical Configuration & Homepage Metadata', () => {
  it('SITE_URL constant is set to exactly https://www.casapronto.ro', () => {
    expect(SITE_URL).toBe('https://www.casapronto.ro');
    expect(SITE_URL).not.toContain('casapronto.ro/wp-json');
    expect(SITE_URL).toMatch(/^https:\/\/www\.casapronto\.ro$/);
  });

  it('Root layout configures metadataBase to https://www.casapronto.ro', () => {
    expect(rootMetadata.metadataBase).toBeDefined();
    expect(rootMetadata.metadataBase?.toString()).toBe('https://www.casapronto.ro/');
  });

  it('Root layout preserves title and description', () => {
    expect(rootMetadata.title).toBe('Casa Pronto Imobiliare');
    expect(rootMetadata.description).toBe('Apartamente, case, terenuri de vanzare in Alba Iulia');
  });

  it('TEST C: Homepage metadata has canonical https://www.casapronto.ro/', () => {
    expect(homeMetadata.alternates).toBeDefined();
    expect(homeMetadata.alternates?.canonical).toBe('https://www.casapronto.ro/');
  });
});
