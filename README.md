# 🏡 Casa Pronto Redux

<div align="left">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB" alt="React" />
  <img src="https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/WordPress-%23117AC9.svg?style=for-the-badge&logo=WordPress&logoColor=white" alt="WordPress" />
  <img src="https://img.shields.io/badge/tanstack%20query-FF4154?style=for-the-badge&logo=reactquery&logoColor=white" alt="TanStack Query" />
</div>
<br>

A modern, fast, and responsive web application for the Casa Pronto real estate agency, built on a Headless WordPress + Next.js App Router architecture. The project transforms the agency's massive database (4,700+ listings) into a fluid, highly-performant user experience with native Server-Side Rendering (SSR) and full SEO compliance.

## 🚀 Tech Stack 
* **Frontend:** Next.js (App Router), React 18, TypeScript
* **State Management & Data Fetching:** React Context (`SearchContext`), TanStack Query
* **Styling:** Tailwind CSS, shadcn/ui, Lucide Icons
* **Backend/API:** Headless WordPress REST API (Custom Endpoints, Post Types & Meta Boxes)
* **Testing:** Playwright (End-to-End), Vitest (Unit)

## ⚡ Architecture: Hybrid SSR & CSR
To achieve optimal Lighthouse scores, instantaneous page loads, and native Googlebot crawlability, the application utilizes a modern **Hybrid Next.js App Router Architecture**:
* **Server-Side Rendered Initial Payload (SSR):** Critical listing data and property detail pages (`/proprietate/[id]`) are fetched directly on the server inside async Server Components. Server HTML includes full SEO metadata (`generateMetadata`), titles, descriptions, and Open Graph tags.
* **Client-Side Hydration & State:** Interactive filtering, live search queries, view mode toggling, and dynamic pagination are handed off to client-side components wrapped in React Context and TanStack Query after initial hydration.
* **Native Next.js Routing:** File-based App Router structure eliminating legacy client-side routing libraries.

## 🔄 Architecture Migration Journey (V1 SPA → V2 Next.js App Router)

### Why We Migrated
The initial version (V1) was built as a Vite-based React Single Page Application (SPA) with a custom Node.js/Puppeteer build script (`generate-ssg.js`) and a PHP `.htaccess` regex injection layer (`index.php`) designed to pre-render HTML for Googlebot. While innovative, this hybrid SPA approach suffered from several limitations:
* **SEO & Indexing:** Direct route visits showed brief loading spinners, React Helmet metadata was injected on the client side, and Googlebot frequently struggled to crawl dynamic SPA routes.
* **Server Complexity:** Maintaining custom PHP regex string replacements inside `index.php` created maintenance overhead and potential hydration mismatches.
* **Performance:** Crawl budget was consumed inefficiently without native server-side rendering.

### Migration Strategy & Implementation Roadmap

#### ✅ Phase 0 — Core App Router Migration (Completed)
* **Framework Upgrade:** Migrated from Vite + `react-router-dom` to **Next.js 16 (App Router)**.
* **Server-Side Data Fetching:** Homepage (`src/app/page.tsx`) fetches an initial payload of 60 properties on the server; dynamic property detail pages (`/proprietate/[id]`) run as async Server Components.
* **Native Metadata (`generateMetadata`):** Replaced React Helmet and PHP regex injection with native Next.js `generateMetadata()` for server HTML metadata, canonical links, and Open Graph tags.
* **Client State & Navigation:** Refactored navigation to `next/link` and `next/navigation`, maintaining `SearchContext` + TanStack Query for seamless client-side hydration.

#### 🔄 Phase 1 — Technical SEO Foundation (Active Branch: `fix/seo-foundation`)
* **Dynamic XML Sitemap (`app/sitemap.ts`):** Generating automatic sitemap entries for all ~4,700+ property listings.
* **Robots Configuration (`app/robots.ts`):** Native Next.js robots directives.
* **Structured Data (JSON-LD):** Injecting `RealEstateListing` and `BreadcrumbList` schema markup into server HTML.
* **Canonical & Error Boundaries:** Adding branded `not-found.tsx` and handling category sub-path canonicals.

#### 🚀 Phase 2 — API & Performance Optimization (Upcoming)
* **WordPress Query Optimization:** Implementing field filtering (`_fields`) on `/wp-json/casapronto/v1/anunturi` to shrink API payload sizes.
* **Request Deduplication:** Wrapping WordPress API fetchers in React `cache()` to eliminate duplicate server requests between `generateMetadata()` and page components.
* **Image Optimization:** Migrating standard `<img>` tags to `next/image` with WebP/AVIF auto-conversion and responsive sizes.

## 🧠 State Management & Search Synchronization
* Highly optimized URL state synchronization (`SearchContext` + `useSearchParams` / `useRouter`) allowing users to share exact search filter combinations via deep link URLs seamlessly.

## ⚙️ Backend & Headless WordPress Integration
* **Custom Endpoints:** Connects to `/wp-json/casapronto/v1/anunturi` for fetching property collections and single property details.
* **Taxonomies & Meta:** Dynamic taxonomy mapping for property types (`tip`), statuses (`tab`), locations (`zone`), surface areas, and room counts.
* **Media Optimization:** Direct integration with WordPress media library arrays.

## 🛠️ Development & Deployment

```bash
# Install dependencies
npm install

# Run local development server
npm run dev

# Production build
npm run build

# Start production server
npm run start
```

---

*🤖 **AI-Assisted & Human-Engineered Workflow:*** *This project represents a powerful hybrid approach—combining advanced AI tools with hardcore manual engineering. While initially bootstrapped with **Lovable** for rapid UI prototyping, and leveraging **Antigravity IDE** to build complex React logic, the core integration relied heavily on manual coding and human oversight. Server configurations, custom Next.js App Router integrations, and performance optimizations were meticulously hand-coded and fine-tuned by the developer. The result is a carefully handcrafted, production-grade application capable of handling 4,700+ properties with uncompromising speed and SEO compliance.*
