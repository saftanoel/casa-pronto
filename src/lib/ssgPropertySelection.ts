import { findPropertyListingRoute, matchesPropertyRouteFilters } from "@/data/propertyListingRoutes";
import type { TaxonomyMatchSource } from "@/lib/propertyTaxonomy";

/** Select exact route matches before applying the SSG payload cap; filter() preserves fixture order. */
export function selectPrerenderPropertyCandidates<T extends TaxonomyMatchSource>(
  posts: T[],
  pathname: string,
  limit = 100,
): T[] {
  const route = findPropertyListingRoute(pathname);
  const routePosts = route
    ? posts.filter((post) => matchesPropertyRouteFilters(post, route))
    : posts;
  return routePosts.slice(0, limit);
}
