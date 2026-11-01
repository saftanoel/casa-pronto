import { useQuery } from "@tanstack/react-query";
import { fetchAllProperties, fetchPropertyById, fetchInitialProperties, fetchTaxonomies } from "@/lib/api/wordpress";
import type { Property } from "@/data/properties";
import type { TaxonomyResponse } from "@/lib/api/wordpress";
import { SSG_PROPERTY_SEED_QUERY_KEY } from "@/ssg-hydration";

/** Fetch initial 60 properties (instant first paint) */
export function useInitialProperties(limit = 60) {
  return useQuery<Property[]>({
    queryKey: ["properties-initial", limit],
    queryFn: () => fetchInitialProperties(limit),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** Fetch all ~5000 properties (background, for global filtering) */
export function useAllProperties(enabled = true) {
  return useQuery<Property[]>({
    queryKey: ["properties"],
    queryFn: fetchAllProperties,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
    enabled,
  });
}

/** Route-specific data embedded in SSG HTML; it never initiates a request. */
export function usePrerenderedProperties() {
  return useQuery<Property[]>({
    queryKey: SSG_PROPERTY_SEED_QUERY_KEY,
    queryFn: () => Promise.resolve([]),
    enabled: false,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  });
}

/** Fetch taxonomy options from the fast dedicated endpoint */
export function useTaxonomies() {
  return useQuery<TaxonomyResponse>({
    queryKey: ["taxonomies"],
    queryFn: fetchTaxonomies,
    staleTime: 60 * 60 * 1000,
    gcTime: 120 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/** Legacy: fetch all properties (used by homepage) */
export function useProperties() {
  return useInitialProperties(60);
}

export function useProperty(id: number | undefined) {
  return useQuery<Property | null>({
    queryKey: ["property", id],
    queryFn: () => (id ? fetchPropertyById(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
