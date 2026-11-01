import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import express from 'express';
import { fileURLToPath } from 'url';
import Critters from 'critters';
import { addPrerenderHydration } from './ssg-hydration-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;
const DIST_DIR = path.resolve(__dirname, '../dist');
const SHELL_SNAPSHOT_PATH = path.resolve(__dirname, '../.ssg-vite-shell.html');

const routes = [
  "/",
  "/proprietati",
  "/apartamente",
  "/case",
  "/terenuri",
  "/spatii-comerciale",
  "/garsoniere",
  "/hale",
  "/birouri",
  "/vile",
  "/apartamente-alba-micesti",
  "/apartamente-ampoi",
  "/apartamente-centru",
  "/apartamente-cetate",
  "/case-alba-micesti",
  "/case-barabant",
  "/case-centru",
  "/case-cetate",
  "/case-ciugud",
  "/case-cugir",
  "/case-micesti",
  "/case-oarda",
  "/garsoniere-centru",
  "/garsoniere-cetate",
  "/hale-centru",
  "/hale-cetate",
  "/spatii-comerciale-centru",
  "/spatii-comerciale-cetate",
  "/terenuri-alba-micesti",
  "/terenuri-centru",
  "/terenuri-cetate",
  "/terenuri-ciugud",
  "/terenuri-micesti",
  "/terenuri-oarda"
];

const hydrationErrorsByRoute = new Map();
const blockedProductionApiRequests = [];
const blockedExternalRequestsByType = new Map();

function recordHydrationError(route, message) {
  if (!/Minified React error #(418|423)|Hydration failed|error while hydrating/i.test(message)) {
    return;
  }
  if (!hydrationErrorsByRoute.has(route)) hydrationErrorsByRoute.set(route, new Set());
  hydrationErrorsByRoute.get(route).add(message);
}

function isProductionApiRequest(requestUrl) {
  try {
    const parsed = new URL(requestUrl);
    const hostname = parsed.hostname.toLowerCase();
    const isCasaProntoHost = hostname === 'casapronto.ro' || hostname.endsWith('.casapronto.ro');
    return isCasaProntoHost && parsed.pathname.startsWith('/wp-json/');
  } catch {
    return false;
  }
}

async function startServer(spaShellHtml) {
  const app = express();

  // Serve built assets, fixtures, and route HTML already generated.
  app.use(express.static(DIST_DIR));

  // Unknown routes always receive the original in-memory Vite shell.
  // Never read dist/index.html here: the root route overwrites it first.
  app.use((req, res) => {
    res.status(200).type('html').set('Cache-Control', 'no-store').send(spaShellHtml);
  });

  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`[SSG] Internal server running on http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function processBatch(batchRoutes, batchIndex) {
  console.log(`\n[SSG] --- Starting Batch ${batchIndex} (${batchRoutes.length} routes) ---`);

  let browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  try {
    for (let i = 0; i < batchRoutes.length; i++) {
      const route = batchRoutes[i];
      const url = `http://localhost:${PORT}${route}`;
      console.log(`[SSG] Prerendering: ${route}`);

      let page;
      let timedOut = false;
      let routeFailure = null;
      try {
        page = await browser.newPage();

        // Keep browser diagnostics attributable to the current route.
        page.on('console', msg => {
          const message = msg.text();
          console.log(`[Browser Console ${route}] ${msg.type().toUpperCase()} ${message}`);
          recordHydrationError(route, message);
        });
        page.on('pageerror', err => {
          const message = err.toString();
          console.error(`[Browser Error ${route}] ${message}`);
          recordHydrationError(route, message);
        });
        page.on('requestfailed', request => console.error(
          `[Browser Request Failed ${route}] ${request.url()} - ${request.failure()?.errorText}`
        ));

        // Intercept all browser requests before navigation, including fetch/XHR.
        // Only the local SSG server and data URLs may continue.
        await page.setRequestInterception(true);
        page.on('request', request => {
          const reqUrl = request.url();
          let requestOrigin = null;
          try {
            requestOrigin = new URL(reqUrl).origin;
          } catch {
            // Malformed and non-HTTP requests remain blocked.
          }
          if (requestOrigin === `http://localhost:${PORT}` || reqUrl.startsWith('data:')) {
            request.continue().catch(error => {
              console.error(`[SSG] Failed to continue local request ${reqUrl}: ${error.message}`);
            });
            return;
          }

          const resourceType = request.resourceType();
          blockedExternalRequestsByType.set(
            resourceType,
            (blockedExternalRequestsByType.get(resourceType) || 0) + 1
          );

          if (isProductionApiRequest(reqUrl)) {
            const record = {
              route,
              method: request.method(),
              resourceType,
              url: reqUrl,
            };
            blockedProductionApiRequests.push(record);
            console.warn(`[SSG] Blocked production API request before network: ${JSON.stringify(record)}`);
          }

          request.abort().catch(error => {
            console.error(`[SSG] Failed to abort external request ${reqUrl}: ${error.message}`);
          });
        });

        // Strict 20s Global Timeout for the entire route
        await Promise.race([
          (async () => {
            // domcontentloaded is enough — all JS is bundled synchronously (no lazy chunks)
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Wait for route components to confirm their required local queries succeeded,
            // then allow the committed DOM two paint frames to settle.
            await page.waitForFunction(
              () => {
                const root = document.getElementById('root');
                return window.__PRERENDER_READY_FIRED === true
                  && root
                  && root.children.length > 0
                  && root.querySelector('h1')
                  && root.innerText.trim().length > 50;
              },
              { timeout: 15000, polling: 100 }
            );

            await page.evaluate(() => new Promise(resolve => {
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            }));
          })(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Global Route Timeout (20s)")), 20000))
        ]);

      } catch (err) {
        timedOut = true;
        routeFailure = err;
        console.error(`[SSG] Route ${route} failed readiness or navigation; generation will stop. Error: ${err.message}`);
      }

      if (!timedOut) {
        // Grab whatever HTML is there
        try {
          if (page && !page.isClosed()) {
            // Use Promise.race for evaluate as well to absolutely prevent 180s protocol deadlocks
            const rendered = await Promise.race([
              page.evaluate(() => ({
                html: document.documentElement.outerHTML,
                queryState: window.__PRERENDER_QUERY_STATE__ || null,
              })),
              new Promise((_, reject) => setTimeout(() => reject(new Error("HTML Extraction Timeout (5s)")), 5000))
            ]);
            const fullHtml = `<!DOCTYPE html>\n${addPrerenderHydration(rendered.html, route, rendered.queryState)}`;

            let routeDir = DIST_DIR;
            if (route !== '/') {
              routeDir = path.join(DIST_DIR, route);
              if (!fs.existsSync(routeDir)) {
                fs.mkdirSync(routeDir, { recursive: true });
              }
            }
            fs.writeFileSync(path.join(routeDir, 'index.html'), fullHtml, 'utf-8');
          }
        } catch (e) {
          console.error(`[SSG] Failed to save HTML for ${route}: ${e.message}`);
          timedOut = true;
          routeFailure = e;
        }
      }

      try {
        if (page && !page.isClosed()) {
          // Wrap page.close() in a timeout to detect a poisoned page
          await Promise.race([
            page.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Page close timeout (3s)")), 3000))
          ]);
        }
      } catch (e) {
        console.error(`[SSG] Failed to close page for ${route}: ${e.message}. Browser is POISONED. Restarting browser...`);
        try {
          if (browser.process()) {
            browser.process().kill('SIGKILL');
          }
        } catch (killErr) {
          // ignore
        }

        // Launch a fresh browser for the rest of the batch
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ]
        });
      }

      if (routeFailure) {
        throw new Error(`[SSG] Aborting after route ${route} failed: ${routeFailure.message}`);
      }
    }
  } finally {
    console.log(`[SSG] Closing browser for Batch ${batchIndex}...`);
    try {
      // Bulletproof Browser Teardown
      await Promise.race([
        browser.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Browser close timeout (5s)")), 5000))
      ]);
      console.log(`[SSG] Browser closed cleanly.`);
    } catch (err) {
      console.warn(`[SSG] Browser refused to close: ${err.message}. Brutally murdering process...`);
      const proc = browser.process();
      if (proc) {
        proc.kill('SIGKILL');
      }
    }
  }
}

async function runSSG() {
  console.log('[SSG] Starting standalone SSG generation...');

  if (!fs.existsSync(DIST_DIR)) {
    console.error('[SSG] Error: dist directory not found. Run vite build first.');
    process.exit(1);
  }

  const shellPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(shellPath)) {
    throw new Error('[SSG] Vite SPA shell is missing. Run the isolated Vite build first.');
  }

  const currentIndexHtml = fs.readFileSync(shellPath, 'utf-8');
  let spaShellHtml;
  if (currentIndexHtml.includes('<div id="root"></div>')) {
    // Save the shell outside dist so later SSG retries can still use it.
    spaShellHtml = currentIndexHtml;
    fs.writeFileSync(SHELL_SNAPSHOT_PATH, spaShellHtml, 'utf-8');
  } else if (fs.existsSync(SHELL_SNAPSHOT_PATH)) {
    spaShellHtml = fs.readFileSync(SHELL_SNAPSHOT_PATH, 'utf-8');
    if (!spaShellHtml.includes('<div id="root"></div>')) {
      throw new Error('[SSG] Saved Vite SPA shell is invalid. Run the isolated Vite build again.');
    }
    console.log('[SSG] Reusing the saved original Vite shell for this validation run.');
  } else {
    throw new Error('[SSG] Expected a fresh Vite SPA shell with an empty #root. Rebuild dist before SSG.');
  }

  const server = await startServer(spaShellHtml);
  const BATCH_SIZE = 10;

  try {
    // Chunk routes array
    const chunks = [];
    for (let i = 0; i < routes.length; i += BATCH_SIZE) {
      chunks.push(routes.slice(i, i + BATCH_SIZE));
    }

    // Process chunks sequentially
    for (let j = 0; j < chunks.length; j++) {
      await processBatch(chunks[j], j + 1);
    }

    const missingRoutes = routes.filter(route => {
      const routeDir = route === '/' ? DIST_DIR : path.join(DIST_DIR, route);
      return !fs.existsSync(path.join(routeDir, 'index.html'));
    });
    if (missingRoutes.length > 0) {
      throw new Error(`[SSG] Missing generated route HTML: ${missingRoutes.join(', ')}`);
    }
    console.log(`[SSG] Generated HTML for all ${routes.length} configured routes.`);

    // --- WORDPRESS THEME GENERATION ---
    console.log('[SSG] Generating WordPress Theme files (index.php & style.css)...');

    let styleCss = `/*
Theme Name: Casa Pronto Imobiliare (React SPA) 2
Theme URI: https://casapronto.ro
Author: Safta Noel
Description: Tema custom ultra-rapida bazata pe React pentru agentia Casa Pronto Alba Iulia. Static Site Generated(SSG) cu Puppeteer & Vite.
Version: 8.4
License: Proprietary
Text Domain: casapronto
*/`;

    const indexPhp = `<?php
/**
 * Casa Pronto React SPA Theme Router
 */

$request_uri = $_SERVER['REQUEST_URI'];
$parsed_url = parse_url($request_uri);
$path = $parsed_url['path'];

$theme_dir = get_template_directory();
$theme_uri = get_template_directory_uri();

// 1. ASSET INTERCEPTION & REDIRECTION
if (
    strpos($path, '/assets/') === 0 || 
    strpos($path, '/prerender-') === 0 || 
    $path === '/vite.svg'
) {
    wp_redirect($theme_uri . $path, 301);
    exit;
}

// 2. SSG HTML ROUTING
$clean_path = rtrim($path, '/');
$ssg_file = $theme_dir . $clean_path . '/index.html';

if ($clean_path === '') {
    $ssg_file = $theme_dir . '/index.html';
}

// 3. SERVE PRERENDERED HTML
if (file_exists($ssg_file)) {
    echo file_get_contents($ssg_file);
    exit;
}

// 4. DYNAMIC ROUTE FALLBACK
$fallback_file = $theme_dir . '/index.html';
if (file_exists($fallback_file)) {
    $html = file_get_contents($fallback_file);
    
    // Inject dynamic SEO tags for property pages to allow Googlebot to index them immediately
    $current_path = $_SERVER['REQUEST_URI'];
    if (preg_match('#/proprietate/(\\d+)#i', $current_path, $matches)) {
        $property_id = intval($matches[1]);
        $post = get_post($property_id);
        
        if ($post) {
            $title = get_the_title($property_id);
            $seo_title = get_post_meta($property_id, 'rank_math_title', true);
            if ($seo_title) {
                $seo_title = str_replace('%title%', $title, $seo_title);
                $seo_title = str_replace('%sep%', '-', $seo_title);
                $seo_title = str_replace('%sitename%', 'Casa Pronto Imobiliare', $seo_title);
            } else {
                $seo_title = $title . ' | Casa Pronto Imobiliare';
            }
            
            $seo_desc = get_post_meta($property_id, 'rank_math_description', true);
            if (!$seo_desc) {
                $seo_desc = wp_trim_words($post->post_content, 25);
            }
            
            $canonical = get_permalink($property_id);
            
            // Clean out the generic homepage tags (SAFE SYNTAX)
            $html = preg_replace('/<title>.*?<\\/title>/is', '', $html);
            $html = preg_replace('/<meta[^>]*name="description"[^>]*>/i', '', $html);
            $html = preg_replace('/<link[^>]*rel=[^>]*canonical[^>]*>/i', '', $html);
            $html = preg_replace('/<meta[^>]*property="og:(title|description|url|type)"[^>]*>/i', '', $html);
            
            // Inject property specific tags
            $head_inject = '
                <title>' . esc_html($seo_title) . '</title>
                <meta name="description" content="' . esc_attr($seo_desc) . '">
                <link rel="canonical" href="' . esc_url($canonical) . '">
                <meta property="og:title" content="' . esc_attr($seo_title) . '">
                <meta property="og:description" content="' . esc_attr($seo_desc) . '">
                <meta property="og:url" content="' . esc_url($canonical) . '">
                <meta property="og:type" content="article">
            ';
            $html = str_replace('</head>', $head_inject . '</head>', $html);
        } else {
            // Strip any canonical from the fallback so it does not falsely claim to be the homepage
            $html = preg_replace('/<link[^>]*rel=[^>]*canonical[^>]*>/i', '', $html);
        }
    } elseif (strpos($parsed_url['path'], '/proprietati') === 0) {
        parse_str(parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY) ?? '', $query_params);
        $tip = isset($query_params['tip']) ? sanitize_text_field($query_params['tip']) : '';
        $tab = isset($query_params['tab']) ? sanitize_text_field($query_params['tab']) : 'toate';
        $zone = isset($query_params['zone']) ? sanitize_text_field($query_params['zone']) : '';
        
        if ($tip || $zone || $tab !== 'toate') {
            $catLabel = "Anunțuri Imobiliare";
            if ($tip) {
                $catLabel = ucfirst(str_replace('-', ' ', $tip));
            }
            
            $zoneLabel = "Alba Iulia și împrejurimi";
            if ($zone) {
                $zoneLabel = ucfirst(str_replace('-', ' ', $zone));
            } else if ($tip) {
                $zoneLabel = "Alba Iulia";
            }
            
            $actionLabel = "de vânzare și închiriere";
            if ($tab === "cumparare") $actionLabel = "de vânzare";
            elseif ($tab === "inchiriere") $actionLabel = "de închiriat";
            elseif ($tab === "vandute") $actionLabel = "vândute";
            
            if (!$tip) {
                $seo_title = "Anunțuri Imobiliare {$actionLabel} {$zoneLabel} | Casa Pronto";
            } else {
                $seo_title = "{$catLabel} {$actionLabel} {$zoneLabel} | Casa Pronto";
            }
            
            $catDescLabel = $tip ? strtolower($catLabel) : "proprietăți imobiliare";
            $descZoneLabel = $zone ? $zoneLabel : "Alba Iulia";
            $seo_desc = "Vezi cele mai noi oferte de {$catDescLabel} {$actionLabel} în {$descZoneLabel}. Găsește-ți casa de vis cu Casa Pronto!";
            
            // Clean out the generic homepage tags (SAFE SYNTAX)
            $html = preg_replace('/<title>.*?<\\/title>/is', '', $html);
            $html = preg_replace('/<meta[^>]*name="description"[^>]*>/i', '', $html);
            $html = preg_replace('/<meta[^>]*property="og:(title|description)"[^>]*>/i', '', $html);
            // 1. Strip out the old canonical tag safely without quote matching conflicts
            $html = preg_replace('/<link[^>]*rel=[^>]*canonical[^>]*>/i', '', $html);
            
            // 2. Rebuild the clean canonical string
            $canonical_params = [];
            $whitelist = ['tip', 'zone', 'tab', 'rooms', 'area', 'price', 'q'];
            foreach ($whitelist as $key) {
                if (!empty($query_params[$key])) {
                    $canonical_params[$key] = $query_params[$key];
                }
            }
            
            $canonical_url = 'https://casapronto.ro/proprietati';
            if (!empty($canonical_params)) {
                $canonical_url .= '?' . http_build_query($canonical_params);
            }
            
            // Inject dynamic tags
            $head_inject = '
                <title>' . esc_html($seo_title) . '</title>
                <meta name="description" content="' . esc_attr($seo_desc) . '">
                <meta property="og:title" content="' . esc_attr($seo_title) . '">
                <meta property="og:description" content="' . esc_attr($seo_desc) . '">
            ';
            // 3. Inject the dynamic canonical tag smoothly
            $canonical_inject = '<link rel="canonical" href="' . htmlspecialchars($canonical_url) . '" />' . "\n";
            $html = str_replace('</head>', $head_inject . $canonical_inject . '</head>', $html);
        }
    } else {
        // Strip the canonical for unknown/404 routes as well
        $html = preg_replace('/<link[^>]*rel=[^>]*canonical[^>]*>/i', '', $html);
    }
    
    echo $html;
    exit;
}

// 5. ULTIMATE FAILSAFE
echo "<h1>Casa Pronto SPA Theme Error: index.html not found.</h1>";
exit;
`;

    const functionsPhp = `<?php
// Opreste redirectul automat al WordPress pe pagina de proprietati pentru a pastra filtrele (?tip=, ?zona=, etc.)
add_filter('redirect_canonical', function($redirect_url, $requested_url) {
    if (strpos($requested_url, 'proprietati') !== false) {
        return false; // Îi spunem lui WordPress să ignore regulile de redirect pentru această rută
    }
    return $redirect_url;
}, 10, 2);
`;

    fs.writeFileSync(path.join(DIST_DIR, 'style.css'), styleCss, 'utf-8');
    fs.writeFileSync(path.join(DIST_DIR, 'index.php'), indexPhp, 'utf-8');
    fs.writeFileSync(path.join(DIST_DIR, 'functions.php'), functionsPhp, 'utf-8');

    console.log('[SSG] Theme generation complete.');

    // --- CRITICAL CSS INLINING (Critters) ---
    // Process every HTML file in dist/ and inline the above-the-fold CSS.
    console.log('[SSG] Inlining critical CSS into all HTML files...');
    const critters = new Critters({
      path: DIST_DIR,
      publicPath: '/',
      preload: 'swap',
      pruneSource: false,
      mergeStylesheets: true,
      inlineFonts: false,
    });

    // Collect all index.html files recursively
    function findHtmlFiles(dir) {
      const files = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...findHtmlFiles(fullPath));
        } else if (entry.name.endsWith('.html')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const htmlFiles = findHtmlFiles(DIST_DIR);
    for (const htmlFile of htmlFiles) {
      const html = fs.readFileSync(htmlFile, 'utf-8');
      try {
        const processed = await critters.process(html);
        fs.writeFileSync(htmlFile, processed, 'utf-8');
      } catch (e) {
        // Non-fatal — log and continue
        console.warn(`[SSG] Critters skipped ${htmlFile}: ${e.message}`);
      }
    }
    console.log(`[SSG] Critical CSS inlined into ${htmlFiles.length} HTML files.`);
    const blockedByType = [...blockedExternalRequestsByType.entries()]
      .map(([type, count]) => type + '=' + count)
      .join(', ');
    console.log('[SSG] External browser requests blocked before network by resource type: ' + (blockedByType || 'none'));
    console.log('[SSG] Production WordPress API requests blocked before network: ' + blockedProductionApiRequests.length);
    for (const record of blockedProductionApiRequests) {
      console.log('[SSG] Blocked API record: ' + JSON.stringify(record));
    }

    if (hydrationErrorsByRoute.size > 0) {
      console.error('[SSG] React hydration errors were observed:');
      for (const [route, messages] of hydrationErrorsByRoute.entries()) {
        for (const message of messages) {
          console.error('[SSG] Hydration error route=' + route + ': ' + message);
        }
      }
      console.error('[SSG] Candidate output is not release-ready until these errors are investigated.');
      process.exitCode = 1;
    } else {
      console.log('[SSG] No React hydration errors #418 or #423 were observed.');
      console.log('[SSG] The dist/ folder is ready for review.');
    }
    // -----------------------------------

  } catch (error) {
    console.error('[SSG] Fatal Error during prerendering:', error);
    process.exit(1);
  } finally {
    server.close();
    console.log('[SSG] Server shut down.');
  }
}

runSSG();
