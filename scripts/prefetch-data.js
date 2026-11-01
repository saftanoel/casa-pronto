import fs from 'fs';
import path from 'path';

// We fetch directly from the WordPress API endpoint
const WP_API_BASE = (process.env.CASA_PRONTO_API_BASE_URL || "https://casapronto.ro/wp-json/casapronto/v1").replace(/\/$/, "");
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

async function fetchAllProperties() {
  console.log("Starting to fetch all properties from WordPress...");

  const PER_PAGE = 200;
  const fetchPage = async (page, expectedTotals) => {
    const response = await fetch(`${WP_API_BASE}/anunturi?per_page=${PER_PAGE}&page=${page}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch properties page ${page}: HTTP ${response.status}.`);
    }

    const readHeader = (name) => {
      const raw = response.headers.get(name);
      if (raw === null || !/^\d+$/.test(raw.trim())) {
        throw new Error(`Page ${page} is missing a valid ${name} header.`);
      }
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) throw new Error(`Page ${page} has an invalid ${name} header.`);
      return value;
    };

    const totalPages = readHeader('X-WP-TotalPages');
    const totalItems = readHeader('X-WP-Total');
    if (totalPages !== Math.ceil(totalItems / PER_PAGE)) {
      throw new Error(`Page ${page} has inconsistent pagination headers.`);
    }
    if (expectedTotals && (totalPages !== expectedTotals.totalPages || totalItems !== expectedTotals.totalItems)) {
      throw new Error(`Catalog totals changed while fetching page ${page}.`);
    }

    let posts;
    try {
      posts = await response.json();
    } catch {
      throw new Error(`Page ${page} returned invalid JSON.`);
    }
    if (!Array.isArray(posts) || posts.some(post =>
      !post ||
      !Number.isSafeInteger(post.id) ||
      post.id <= 0 ||
      typeof post.date !== 'string' ||
      typeof post.title?.rendered !== 'string' ||
      typeof post.content?.rendered !== 'string'
    )) {
      throw new Error(`Page ${page} returned an invalid properties array.`);
    }

    const expectedCount = Math.max(0, Math.min(PER_PAGE, totalItems - (page - 1) * PER_PAGE));
    if (posts.length !== expectedCount) {
      throw new Error(`Page ${page} returned ${posts.length} properties; expected ${expectedCount}.`);
    }
    return { posts, totalPages, totalItems };
  };

  const firstPage = await fetchPage(1);
  console.log(`Found ${firstPage.totalItems} properties across ${firstPage.totalPages} pages.`);
  const allPosts = [...firstPage.posts];
  const seenIds = new Set();
  for (const post of firstPage.posts) {
    if (seenIds.has(post.id)) throw new Error(`Property ${post.id} appeared more than once on page 1.`);
    seenIds.add(post.id);
  }

  // Keep build-time pagination sequential too; validate a response before requesting the next page.
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const result = await fetchPage(page, firstPage);
    for (const post of result.posts) {
      if (seenIds.has(post.id)) throw new Error(`Property ${post.id} appeared more than once on page ${page}.`);
      seenIds.add(post.id);
      allPosts.push(post);
    }
    console.log(`Fetched page ${page} / ${firstPage.totalPages}`);
  }

  if (allPosts.length !== firstPage.totalItems) {
    throw new Error(`Fetched ${allPosts.length} properties, but headers reported ${firstPage.totalItems}.`);
  }
  console.log(`Successfully fetched ${allPosts.length} total properties.`);

  const destFile = path.join(PUBLIC_DIR, 'prerender-properties.json');
  fs.writeFileSync(destFile, JSON.stringify(allPosts), 'utf-8');
  console.log(`Saved to ${destFile}`);
}

async function fetchTaxonomies() {
  console.log("Starting to fetch taxonomies from WordPress...");
  const response = await fetch(`${WP_API_BASE}/taxonomii`);
  if (!response.ok) {
    throw new Error(`Failed to fetch taxonomies: ${response.status}`);
  }

  const data = await response.json();
  const destFile = path.join(PUBLIC_DIR, 'prerender-taxonomies.json');
  fs.writeFileSync(destFile, JSON.stringify(data), 'utf-8');
  console.log(`Saved taxonomies to ${destFile}`);
}

async function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  try {
    await fetchAllProperties();
    await fetchTaxonomies();
    console.log("Prefetch complete!");
  } catch (error) {
    console.error("Error during prefetch:", error);
    process.exit(1);
  }
}

main();
