import { dehydrate, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Property } from "@/data/properties";
import { findPropertyListingRoute, matchesPropertyRouteFilters } from "@/data/propertyListingRoutes";
import { usePrerenderedProperties } from "@/hooks/useProperties";
import { fetchAllProperties } from "@/lib/api/wordpress";
import {
  capturePrerenderQueryState,
  hydratePrerenderQueryState,
  queryClient,
  savePrerenderPropertySeed,
  SSG_PROPERTY_SEED_QUERY_KEY,
} from "@/ssg-hydration";
import { addPrerenderHydration } from "../scripts/ssg-hydration-html.mjs";

describe("SSG query hydration", () => {
  afterEach(() => {
    queryClient.clear();
    delete window.__PRERENDER_INJECTED;
    delete window.__PRERENDER_QUERY_STATE__;
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("restores the route-specific property seed into the client query cache", () => {
    const prerenderQueryClient = new QueryClient();
    const property = { id: 61831, title: "Prerendered property" } as Property;
    prerenderQueryClient.setQueryData(SSG_PROPERTY_SEED_QUERY_KEY, [property]);

    hydratePrerenderQueryState(dehydrate(prerenderQueryClient));

    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePrerenderedProperties(), { wrapper });

    expect(result.current.data).toEqual([property]);
    expect(result.current.fetchStatus).toBe("idle");
    prerenderQueryClient.clear();
  });

  it("places all exact Alba Micesti apartment matches into the generated hydration payload", async () => {
    const fixture = JSON.parse(readFileSync("public/prerender-properties.json", "utf8"));
    const route = findPropertyListingRoute("/apartamente-alba-micesti/");
    if (!route) throw new Error("Expected the Alba Micesti apartment route to be configured.");
    const expectedIds = fixture
      .filter((post: unknown) => matchesPropertyRouteFilters(post as { taxonomies?: Record<string, unknown[]> }, route))
      .map((post: { id: number }) => post.id);

    window.history.replaceState({}, "", route.path);
    window.__PRERENDER_INJECTED = { isPrerendering: true };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const selectedProperties = await fetchAllProperties();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/prerender-properties.json");
    expect(selectedProperties.map((property) => property.id)).toEqual(expectedIds);
    expect(selectedProperties).toHaveLength(40);
    expect(new Set(selectedProperties.map((property) => property.id)).size).toBe(40);

    savePrerenderPropertySeed(selectedProperties);
    capturePrerenderQueryState();
    const generatedHtml = addPrerenderHydration(
      "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>",
      route.path,
      window.__PRERENDER_QUERY_STATE__,
    );
    const script = generatedHtml.match(/<script>window\.__PRERENDER_HYDRATION__=(.*?);<\/script>/s);
    expect(script).not.toBeNull();

    const payload = JSON.parse(script![1]);
    const seedQuery = payload.queryState.queries.find(
      (query: { queryKey: unknown[] }) => query.queryKey[0] === SSG_PROPERTY_SEED_QUERY_KEY[0],
    );
    const hydratedIds = seedQuery.state.data.map((property: Property) => property.id);

    expect(payload.route).toBe("/apartamente-alba-micesti");
    expect(hydratedIds).toEqual(expectedIds);
    expect(hydratedIds).toHaveLength(40);
    expect(new Set(hydratedIds).size).toBe(40);
    expect(selectedProperties.map((property) => property.id)).toEqual(
      fixture.filter((post: unknown) => matchesPropertyRouteFilters(post as { taxonomies?: Record<string, unknown[]> }, route))
        .map((post: { id: number }) => post.id),
    );
  });
});
