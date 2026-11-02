import { useMemo } from "react";
import { type Property } from "@/data/properties";
import { toTaxonomySlug } from "@/lib/propertyTaxonomy";

export { matchesTaxonomy } from "@/lib/propertyTaxonomy";

export interface TaxonomyOption {
  value: string;
  label: string;
}

function extractUnique(properties: Property[], key: "property_type" | "property_status" | "property_city"): TaxonomyOption[] {
  const seen = new Map<string, string>();
  for (const p of properties) {
    const terms = p.taxonomies?.[key] ?? [];
    for (const term of terms as any[]) {
      const slug = toTaxonomySlug(term);
      const name = typeof term === "string" ? term : (term?.name || "");
      if (!seen.has(slug) && name) {
        seen.set(slug, name);
      }
    }
  }
  return Array.from(seen.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ro"));
}

export function useTaxonomyOptions(properties: Property[]) {
  const zones = useMemo(() => extractUnique(properties, "property_city"), [properties]);
  const propertyTypes = useMemo(() => extractUnique(properties, "property_type"), [properties]);
  const statuses = useMemo(() => extractUnique(properties, "property_status"), [properties]);
  return { zones, propertyTypes, statuses };
}
