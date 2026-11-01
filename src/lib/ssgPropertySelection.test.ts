import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROPERTY_LISTING_ROUTES, findPropertyListingRoute, matchesPropertyRouteFilters } from "@/data/propertyListingRoutes";
import { selectPrerenderPropertyCandidates } from "@/lib/ssgPropertySelection";

interface FixtureProperty {
  id: number;
  taxonomies?: {
    property_type?: string[];
    property_status?: string[];
    property_city?: string[];
  };
}

const fixture = JSON.parse(readFileSync("public/prerender-properties.json", "utf8")) as FixtureProperty[];

describe("SSG property route selection", () => {
  it("selects all 40 Alba Micesti apartments from the full fixture in fixture order", () => {
    const route = findPropertyListingRoute("/apartamente-alba-micesti/");
    expect(route).toEqual({ path: "/apartamente-alba-micesti", tip: "apartamente", zone: "alba-micesti" });

    const exactMatches = fixture.filter((property) => matchesPropertyRouteFilters(property, route!));
    const selected = selectPrerenderPropertyCandidates(fixture, "/apartamente-alba-micesti/");
    const selectedIds = selected.map((property) => property.id);

    expect(fixture).toHaveLength(4904);
    expect(exactMatches).toHaveLength(40);
    expect(selectedIds).toEqual(exactMatches.map((property) => property.id));
    expect(new Set(selectedIds).size).toBe(selectedIds.length);
  });

  it("uses the same exact route filters and stable cap for every configured listing route", () => {
    for (const route of PROPERTY_LISTING_ROUTES) {
      const exactMatches = fixture.filter((property) => matchesPropertyRouteFilters(property, route));
      const expected = exactMatches.slice(0, 100).map((property) => property.id);
      const selected = selectPrerenderPropertyCandidates(fixture, `${route.path}/`);

      expect(selected.map((property) => property.id), route.path).toEqual(expected);
      expect(new Set(selected.map((property) => property.id)).size, route.path).toBe(selected.length);
    }
  });
});
