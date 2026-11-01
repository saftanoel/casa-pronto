export type TaxonomyFilterKey = "property_type" | "property_status" | "property_city";

export interface TaxonomyMatchSource {
  taxonomies?: Partial<Record<TaxonomyFilterKey, readonly unknown[]>>;
}

export function toTaxonomySlug(input: unknown): string {
  if (!input) return "";
  const value = typeof input === "string"
    ? input
    : typeof input === "object" && input !== null && "name" in input
      ? (input as { name?: unknown }).name
      : "";
  const str = typeof value === "string" ? value : "";
  return str
    .toLowerCase()
    .replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i")
    .replace(/ș/g, "s").replace(/ț/g, "t")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** Shared taxonomy matching used by listing filters and SSG route selection. */
export function matchesTaxonomy(
  property: TaxonomyMatchSource,
  key: TaxonomyFilterKey,
  filterValue: string,
): boolean {
  if (!filterValue) return true;
  const terms = property.taxonomies?.[key] ?? [];
  return terms.some((term) => toTaxonomySlug(term) === filterValue);
}
