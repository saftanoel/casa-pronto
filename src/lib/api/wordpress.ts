import { type Property } from "@/data/properties";
import { selectPrerenderPropertyCandidates } from "@/lib/ssgPropertySelection";

export const WP_API_BASE = import.meta.env.VITE_API_BASE_URL || "https://casapronto.ro/wp-json/casapronto/v1";


console.log("MAGIE SAU EROARE? URL-UL ESTE:", WP_API_BASE);

if (!WP_API_BASE) {
  console.error("Lipsește VITE_API_BASE_URL din fișierul .env!");
}
// Custom endpoint returns flattened data — no _embed or _fields needed
const PER_PAGE_LIST = 12;
const PER_PAGE_ALL = 200;
const MAX_PER_PAGE = 200;

export function isPrerendering(): boolean {
  if (typeof window === 'undefined') return false;
  const isPuppeteer = window.navigator && window.navigator.userAgent && window.navigator.userAgent.includes('HeadlessChrome');
  const isInject = window.__PRERENDER_INJECTED?.isPrerendering;
  return !!(isPuppeteer || isInject);
}

export interface WPPost {
  id: number;
  slug?: string;
  date: string;
  title: { rendered: string };
  content: { rendered: string };
  featured_media: number;
  gallery_urls?: string[];
  gallery_data?: Array<{
    full: string;
    medium_large?: string;
    medium?: string;
    webp?: string;
    thumbnail?: string;
  }>;
  taxonomies?: {
    property_type?: string[];
    property_status?: string[];
    property_city?: string[];
  };
  property_details?: {
    price?: string;
    bedrooms?: number;
    bathrooms?: number;
    area?: number;
  };
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url: string;
      media_details?: {
        sizes?: {
          full?: { source_url: string };
          large?: { source_url: string };
          medium_large?: { source_url: string };
          medium?: { source_url: string };
        };
      };
    }>;
  };
  seo?: {
    title?: string;
    description?: string;
    canonical_url?: string;
    og_image?: string;
    og_title?: string;
    og_description?: string;
    noindex?: boolean;
  };
}

export interface PaginatedResult {
  properties: Property[];
  totalPages: number;
  totalItems: number;
}

interface PaginatedPosts {
  posts: WPPost[];
  totalPages: number;
  totalItems: number;
}

function readPaginationHeader(response: Response, name: "X-WP-Total" | "X-WP-TotalPages"): number {
  const rawValue = response.headers.get(name);
  if (rawValue === null || !/^\d+$/.test(rawValue.trim())) {
    throw new Error(
      `Missing or malformed ${name} pagination header. The API must return this header and expose it to the frontend with Access-Control-Expose-Headers.`
    );
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Malformed ${name} pagination header: expected a safe integer.`);
  }
  return value;
}

function validatePosts(value: unknown, page: number): WPPost[] {
  if (!Array.isArray(value)) {
    throw new Error(`Page ${page} returned an invalid response: expected an array of properties.`);
  }

  for (const [index, post] of value.entries()) {
    if (
      !post ||
      typeof post !== "object" ||
      !Number.isSafeInteger((post as WPPost).id) ||
      (post as WPPost).id <= 0 ||
      typeof (post as WPPost).date !== "string" ||
      typeof (post as WPPost).title?.rendered !== "string" ||
      typeof (post as WPPost).content?.rendered !== "string"
    ) {
      throw new Error(`Page ${page} returned an invalid property at position ${index + 1}.`);
    }
  }

  return value as WPPost[];
}

async function fetchPaginatedPosts(
  page: number,
  perPage: number,
  expectedTotals?: { totalPages: number; totalItems: number }
): Promise<PaginatedPosts> {
  const response = await fetch(`${WP_API_BASE}/anunturi?per_page=${perPage}&page=${page}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch properties page ${page}: HTTP ${response.status}.`);
  }

  const totalPages = readPaginationHeader(response, "X-WP-TotalPages");
  const totalItems = readPaginationHeader(response, "X-WP-Total");
  const calculatedTotalPages = Math.ceil(totalItems / perPage);
  if (totalPages !== calculatedTotalPages) {
    throw new Error(
      `Invalid pagination headers on page ${page}: X-WP-TotalPages is ${totalPages}, but ${totalItems} properties at ${perPage} per page requires ${calculatedTotalPages} pages.`
    );
  }

  if (expectedTotals && (totalPages !== expectedTotals.totalPages || totalItems !== expectedTotals.totalItems)) {
    throw new Error(`Pagination totals changed while loading page ${page}; the catalog may have changed during the request.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Page ${page} returned invalid JSON.`);
  }

  const posts = validatePosts(payload, page);
  const expectedCount = Math.max(0, Math.min(perPage, totalItems - (page - 1) * perPage));
  if (posts.length !== expectedCount) {
    throw new Error(
      `Page ${page} returned ${posts.length} properties; expected ${expectedCount} from the pagination totals. The catalog may be incomplete.`
    );
  }

  return { posts, totalPages, totalItems };
}

function assertUniquePostIds(posts: WPPost[], seenIds: Set<number>, page: number): void {
  for (const post of posts) {
    if (seenIds.has(post.id)) {
      throw new Error(`Property ${post.id} appeared more than once while loading page ${page}.`);
    }
    seenIds.add(post.id);
  }
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}

function extractType(title: string): "Vânzare" | "Închiriere" | "Vândut" {
  const t = title.toLowerCase();
  if (t.includes("inchiri") || t.includes("închiri")) return "Închiriere";
  if (t.includes("vandu") || t.includes("vându") || t.includes("vandut") || t.includes("vândut")) return "Vândut";
  return "Vânzare";
}

function extractTypeWithTaxonomy(title: string, statuses?: any[]): "Vânzare" | "Închiriere" | "Vândut" {
  // Check taxonomies first — they are the source of truth
  if (statuses && statuses.length > 0) {
    const slugs = statuses.map(s => {
      const val = typeof s === 'string' ? s : (s?.name || "");
      return val.toLowerCase();
    });
    if (slugs.some(s => s.includes("vandu") || s.includes("vându") || s.includes("vandut") || s.includes("vândut"))) return "Vândut";
    if (slugs.some(s => s.includes("inchiri") || s.includes("închiri"))) return "Închiriere";
    if (slugs.some(s => s.includes("cumpar") || s.includes("vanzar") || s.includes("vânzar"))) return "Vânzare";
  }
  // Fallback to title-based detection
  return extractType(title);
}

function parsePrice(raw: string | undefined): { price: string; priceValue: number } {
  if (!raw) return { price: "Preț la cerere", priceValue: 0 };
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const value = parseFloat(cleaned);
  if (isNaN(value) || value === 0) return { price: "Preț la cerere", priceValue: 0 };
  const formatted = value.toLocaleString("ro-RO");
  return { price: `${formatted} €`, priceValue: value };
}

function extractLocation(title: string): { location: string; zone: string } {
  const zonaMatch = title.match(/zona\s+([^.,]+)/i);
  const zone = zonaMatch ? zonaMatch[1].trim() : "";
  const location = zone ? `${zone}, Alba Iulia` : "Alba Iulia";
  return { location, zone: zone.toLowerCase().replace(/\s+/g, "-") };
}

function extractPropertyType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("apartament")) return "apartamente";
  if (t.includes("garsonier")) return "garsoniere";
  if (t.includes("casa") || t.includes("casă")) return "case";
  if (t.includes("vila") || t.includes("vilă")) return "vile";
  if (t.includes("teren")) return "terenuri";
  if (t.includes("birou") || t.includes("birouri")) return "birouri";
  if (t.includes("spatiu") || t.includes("spațiu") || t.includes("depozit") || t.includes("comercial")) return "spatii-comerciale";
  return "altele";
}

function extractFeatures(content: string): string[] {
  const features: string[] = [];
  const text = content.toLowerCase();
  const featureKeywords = [
    { keyword: "central", label: "Centrală termică" },
    { keyword: "balcon", label: "Balcon" },
    { keyword: "garaj", label: "Garaj" },
    { keyword: "parcare", label: "Parcare" },
    { keyword: "mobilat", label: "Mobilat" },
    { keyword: "utilat", label: "Utilat" },
    { keyword: "renovat", label: "Renovat" },
    { keyword: "gradin", label: "Grădină" },
    { keyword: "piscin", label: "Piscină" },
    { keyword: "teras", label: "Terasă" },
    { keyword: "pivnit", label: "Pivniță" },
    { keyword: "lift", label: "Lift" },
    { keyword: "aer conditionat", label: "Aer condiționat" },
    { keyword: "izolat", label: "Izolație termică" },
  ];
  for (const { keyword, label } of featureKeywords) {
    if (text.includes(keyword)) features.push(label);
  }
  return features;
}

/** Get featured image from gallery_urls or placeholder */
function getImageUrl(post: WPPost): string {
  return post.gallery_urls?.[0] || "/placeholder.svg";
}

function isNewProperty(dateStr: string): boolean {
  const postDate = new Date(dateStr);
  const now = new Date();
  return (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24) <= 14;
}

export function mapWPPostToProperty(post: WPPost, preferSmallImage = false): Property {
  const title = post.title.rendered;
  const contentText = stripHtml(post.content.rendered);
  const type = extractTypeWithTaxonomy(title, post.taxonomies?.property_status);
  const { location, zone } = extractLocation(title);
  const featuredImage = getImageUrl(post);

  const details = post.property_details;
  const { price, priceValue } = parsePrice(details?.price);
  const beds = details?.bedrooms ?? 0;
  const baths = details?.bathrooms ?? 0;
  const area = details?.area ?? 0;

  let finalFeaturedImage = featuredImage;
  let galleryImages = post.gallery_urls && post.gallery_urls.length > 0
    ? post.gallery_urls
    : [featuredImage];
  let fullImages = galleryImages;

  if (post.gallery_data && post.gallery_data.length > 0) {
    if (preferSmallImage) {
      // Use medium_large / medium if the API provides them, otherwise fall back to
      // the webp/full URL resized via WordPress's built-in ?w= query param.
      // This cuts typical thumbnail payloads from 1–3 MB down to ~80–150 KB.
      galleryImages = post.gallery_data.map(img => {
        if (img.medium_large) return img.medium_large;
        if (img.medium) return img.medium;
        const src = img.webp || img.full;
        // Append ?w=800 only to wp-content URLs (avoids breaking external/SVG URLs)
        if (src && src.includes('/wp-content/') && !src.includes('?')) {
          return `${src}?w=800`;
        }
        return src;
      });
    } else {
      galleryImages = post.gallery_data.map(img => img.webp || img.full);
    }
    fullImages = post.gallery_data.map(img => img.full);
    finalFeaturedImage = galleryImages[0];
  }

  const taxonomies = {
    property_type: post.taxonomies?.property_type ?? [],
    property_status: post.taxonomies?.property_status ?? [],
    property_city: post.taxonomies?.property_city ?? [],
  };

  return {
    id: post.id,
    image: finalFeaturedImage,
    images: galleryImages,
    fullImages,
    title,
    description: contentText.trim(),
    location,
    zone,
    seo: post.seo,
    price,
    priceValue,
    beds,
    baths,
    area,
    type,
    propertyType: extractPropertyType(title),
    isNew: isNewProperty(post.date),
    features: extractFeatures(contentText),
    agent: "Baba Elena",
    date: post.date,
    taxonomies,
  };
}

/** Paginated fetch — used for load more */
export async function fetchPropertiesPaginated(page = 1, perPage = PER_PAGE_LIST): Promise<PaginatedResult> {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("Page must be a positive integer.");
  }
  if (!Number.isSafeInteger(perPage) || perPage < 1) {
    throw new Error("Page size must be a positive integer.");
  }
  const safePerPage = Math.min(perPage, MAX_PER_PAGE);
  const { posts, totalPages, totalItems } = await fetchPaginatedPosts(page, safePerPage);

  return {
    properties: posts.map(p => mapWPPostToProperty(p, true)),
    totalPages,
    totalItems,
  };
}

/** Fetch all properties — still needed for homepage featured + search context */
export async function fetchAllProperties(): Promise<Property[]> {
  if (isPrerendering()) {
    try {
      const res = await fetch('/prerender-properties.json');
      if (res.ok) {
        const posts = validatePosts(await res.json(), 1);

        const pathname = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';
        // Apply the configured route's exact taxonomy filters before limiting the SSG payload.
        const filteredPosts = selectPrerenderPropertyCandidates(posts, pathname, 100);

        return filteredPosts.map(p => mapWPPostToProperty(p, true));
      }
    } catch (e) {
      console.error("Prerender JSON fallback failed for all properties", e);
    }
    // NEVER fall back to the live API during prerendering to prevent crashes
    return [];
  }

  const firstPage = await fetchPaginatedPosts(1, PER_PAGE_ALL);
  const allPosts = [...firstPage.posts];
  const seenIds = new Set<number>();
  assertUniquePostIds(firstPage.posts, seenIds, 1);

  // Request each following page only after the prior response was validated.
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await fetchPaginatedPosts(page, PER_PAGE_ALL, firstPage);
    assertUniquePostIds(nextPage.posts, seenIds, page);
    allPosts.push(...nextPage.posts);
  }

  if (allPosts.length !== firstPage.totalItems) {
    throw new Error(`Loaded ${allPosts.length} properties, but pagination headers reported ${firstPage.totalItems}. The catalog is incomplete.`);
  }

  return allPosts.map(p => mapWPPostToProperty(p, true));
}
/** Fetch taxonomy options from the dedicated fast endpoint */
export interface TaxonomyTerm {
  slug: string;
  name: string;
  description?: string;
  seo?: {
    title?: string;
    description?: string;
    canonical_url?: string;
    og_image?: string;
    og_title?: string;
    og_description?: string;
    noindex?: boolean;
  };
}

export interface TaxonomyResponse {
  property_city: Array<TaxonomyTerm | string>;
  property_type: Array<TaxonomyTerm | string>;
  property_status: Array<TaxonomyTerm | string>;
}

export async function fetchTaxonomies(): Promise<TaxonomyResponse> {
  if (isPrerendering()) {
    try {
      const res = await fetch('/prerender-taxonomies.json');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error("Prerender JSON fallback failed for taxonomies", e);
    }
    // NEVER fall back to live API during prerendering
    return { property_city: [], property_type: [], property_status: [] };
  }

  const response = await fetch(`${WP_API_BASE}/taxonomii`);
  if (!response.ok) {
    throw new Error(`Failed to fetch taxonomies: ${response.status}`);
  }
  return response.json();
}

/** Fetch initial batch of properties (fast first paint) */
export async function fetchInitialProperties(limit = 9): Promise<Property[]> {
  if (isPrerendering()) {
    try {
      const res = await fetch('/prerender-properties.json');
      if (res.ok) {
        const posts = validatePosts(await res.json(), 1);
        const pathname = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';
        const filteredPosts = selectPrerenderPropertyCandidates(posts, pathname, limit);

        return filteredPosts.map(p => mapWPPostToProperty(p, true));
      }
    } catch (e) {
      console.error("Prerender JSON fallback failed for initial properties", e);
    }
    // NEVER fall back to live API during prerendering
    return [];
  }

  const url = `${WP_API_BASE}/anunturi?limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch initial properties: ${response.status}`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Failed to fetch initial properties: invalid JSON.");
  }
  const posts = validatePosts(payload, 1);
  return posts.map(p => mapWPPostToProperty(p, true));
}

/** Fetch single property by ID — uses dedicated endpoint */
export async function fetchPropertyById(id: number): Promise<Property | null> {
  const postRes = await fetch(`${WP_API_BASE}/anunturi/${id}`);
  if (!postRes.ok) return null;

  const post: WPPost = await postRes.json();
  return mapWPPostToProperty(post);
}

