import { dehydrate, hydrate, QueryClient } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import type { Property } from "@/data/properties";

export const queryClient = new QueryClient();
export const SSG_PROPERTY_SEED_QUERY_KEY = ["properties-ssg-seed"] as const;

export function savePrerenderPropertySeed(properties: Property[]): void {
  queryClient.setQueryData(SSG_PROPERTY_SEED_QUERY_KEY, properties);
}

export function hydratePrerenderQueryState(state: DehydratedState): void {
  hydrate(queryClient, state);
}

/**
 * Store only the data required to reproduce the prerendered first paint.
 * The complete-catalog query intentionally stays out of this payload so a
 * browser can refresh it in the background after hydration.
 */
export function capturePrerenderQueryState(): void {
  if (typeof window === "undefined") return;

  window.__PRERENDER_QUERY_STATE__ = dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => {
      const key = query.queryKey[0];
      return query.state.status === "success" && (
        key === "properties-initial" ||
        key === "properties-ssg-seed" ||
        key === "taxonomies"
      );
    },
  });
}
