import { matchesTaxonomy, type TaxonomyMatchSource } from "@/lib/propertyTaxonomy";

export interface PropertyListingRoute {
  path: string;
  tip?: string;
  zone?: string;
}

/** Shared by React routing and SSG candidate selection. Keep these route filters in one place. */
export const PROPERTY_LISTING_ROUTES: readonly PropertyListingRoute[] = [
  { path: "/apartamente", tip: "apartamente" },
  { path: "/case", tip: "case" },
  { path: "/terenuri", tip: "terenuri" },
  { path: "/spatii-comerciale", tip: "spatii-comerciale" },
  { path: "/garsoniere", tip: "garsoniere" },
  { path: "/hale", tip: "hale" },
  { path: "/birouri", tip: "birouri" },
  { path: "/vile", tip: "vile" },

  { path: "/apartamente-cetate", tip: "apartamente", zone: "cetate" },
  { path: "/apartamente-centru", tip: "apartamente", zone: "centru" },
  { path: "/apartamente-ampoi", tip: "apartamente", zone: "ampoi" },
  { path: "/apartamente-alba-micesti", tip: "apartamente", zone: "alba-micesti" },
  { path: "/garsoniere-cetate", tip: "garsoniere", zone: "cetate" },
  { path: "/garsoniere-centru", tip: "garsoniere", zone: "centru" },

  { path: "/case-cetate", tip: "case", zone: "cetate" },
  { path: "/case-centru", tip: "case", zone: "centru" },
  { path: "/case-alba-micesti", tip: "case", zone: "alba-micesti" },
  { path: "/case-micesti", tip: "case", zone: "micesti" },
  { path: "/case-ciugud", tip: "case", zone: "ciugud" },
  { path: "/case-barabant", tip: "case", zone: "barabant" },
  { path: "/case-oarda", tip: "case", zone: "oarda" },
  { path: "/case-cugir", tip: "case", zone: "cugir" },

  { path: "/terenuri-cetate", tip: "terenuri", zone: "cetate" },
  { path: "/terenuri-centru", tip: "terenuri", zone: "centru" },
  { path: "/terenuri-alba-micesti", tip: "terenuri", zone: "alba-micesti" },
  { path: "/terenuri-micesti", tip: "terenuri", zone: "micesti" },
  { path: "/terenuri-ciugud", tip: "terenuri", zone: "ciugud" },
  { path: "/terenuri-oarda", tip: "terenuri", zone: "oarda" },

  { path: "/spatii-comerciale-cetate", tip: "spatii-comerciale", zone: "cetate" },
  { path: "/spatii-comerciale-centru", tip: "spatii-comerciale", zone: "centru" },
  { path: "/hale-cetate", tip: "hale", zone: "cetate" },
  { path: "/hale-centru", tip: "hale", zone: "centru" },
  { path: "/proprietati" },
];

export function findPropertyListingRoute(pathname: string): PropertyListingRoute | undefined {
  const normalizedPath = pathname.split("?")[0].replace(/\/+$/, "").toLowerCase() || "/";
  return PROPERTY_LISTING_ROUTES.find((route) => route.path === normalizedPath);
}

/** Match the route's taxonomy filters with the same AND semantics used by PropertiesPage. */
export function matchesPropertyRouteFilters(
  property: TaxonomyMatchSource,
  route: Pick<PropertyListingRoute, "tip" | "zone">,
): boolean {
  return (!route.tip || matchesTaxonomy(property, "property_type", route.tip))
    && (!route.zone || matchesTaxonomy(property, "property_city", route.zone));
}
