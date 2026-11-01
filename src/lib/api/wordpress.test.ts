import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllProperties, fetchInitialProperties, fetchPropertiesPaginated } from "@/lib/api/wordpress";

function makePost(id: number) {
  return {
    id,
    date: "2026-10-01T10:00:00",
    title: { rendered: `Apartament ${id}` },
    content: { rendered: `<p>Descriere ${id}</p>` },
    featured_media: 0,
    gallery_urls: [`https://example.test/${id}.jpg`],
    taxonomies: { property_type: ["apartamente"], property_status: ["vanzare"], property_city: ["alba-iulia"] },
  };
}

function jsonResponse(body: unknown, totalItems: number, perPage = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-WP-Total": String(totalItems),
      "X-WP-TotalPages": String(Math.ceil(totalItems / perPage)),
      ...headers,
    },
  });
}

describe("WordPress property pagination", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the initial request on the limit=60 endpoint", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse([makePost(7)], 1));

    const properties = await fetchInitialProperties(60);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/anunturi?limit=60");
    expect(properties.map(property => property.id)).toEqual([7]);
  });

  it("loads distinct pages sequentially with 200 properties per request", async () => {
    const records = Array.from({ length: 4904 }, (_, index) => makePost(index + 1));
    const requestedPages: number[] = [];
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockImplementation(async (input) => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      const page = Number(new URL(String(input)).searchParams.get("page"));
      requestedPages.push(page);
      await new Promise(resolve => setTimeout(resolve, 0));
      const pageRecords = records.slice((page - 1) * 200, page * 200);
      activeRequests -= 1;
      return jsonResponse(pageRecords, records.length);
    });

    const properties = await fetchAllProperties();

    expect(requestedPages).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(maximumActiveRequests).toBe(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("per_page=200&page=1");
    expect(String(fetchMock.mock.calls[1][0])).toContain("per_page=200&page=2");
    expect(String(fetchMock.mock.calls[24][0])).toContain("per_page=200&page=25");
    expect(properties).toHaveLength(4904);
    expect(properties.slice(-104).map(property => property.id)).toEqual(
      records.slice(-104).map(post => post.id),
    );
    expect(new Set(properties.map(property => property.id)).size).toBe(4904);
    expect(properties.map(property => property.id)).toEqual(records.map(post => post.id));
  });

  it("accepts the empty page immediately beyond a 4,904-property catalog", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse([], 4904));

    const result = await fetchPropertiesPaginated(26, 200);

    expect(String(fetchMock.mock.calls[0][0])).toContain("per_page=200&page=26");
    expect(result.properties).toEqual([]);
    expect(result.totalItems).toBe(4904);
    expect(result.totalPages).toBe(25);
  });

  it("caps direct paginated requests at the API maximum of 200", async () => {
    const fetchMock = vi.mocked(fetch);
    const records = Array.from({ length: 200 }, (_, index) => makePost(index + 1));
    fetchMock.mockResolvedValue(jsonResponse(records, 200));

    const result = await fetchPropertiesPaginated(1, 500);

    expect(String(fetchMock.mock.calls[0][0])).toContain("per_page=200&page=1");
    expect(result.properties).toHaveLength(200);
    expect(result.totalItems).toBe(200);
    expect(result.totalPages).toBe(1);
  });

  it("accepts an empty catalog as a valid result", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse([], 0));

    await expect(fetchAllProperties()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["X-WP-Total", "X-WP-TotalPages"])("rejects a missing %s header instead of assuming the catalogue is complete", async (missingHeader) => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse([makePost(1)], 1, 200, { [missingHeader]: "" }));

    await expect(fetchAllProperties()).rejects.toThrow(missingHeader);
  });

  it("rejects malformed pagination header values", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse([makePost(1)], 1, 200, { "X-WP-TotalPages": "1page" }));

    await expect(fetchAllProperties()).rejects.toThrow(/X-WP-TotalPages/);
  });

  it("rejects HTTP errors", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));

    await expect(fetchAllProperties()).rejects.toThrow(/HTTP 503/);
  });

  it("checks the HTTP status of every later page", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      if (page === 1) return jsonResponse(Array.from({ length: 200 }, (_, index) => makePost(index + 1)), 201);
      return new Response("unavailable", { status: 500 });
    });

    await expect(fetchAllProperties()).rejects.toThrow(/page 2: HTTP 500/);
  });

  it("rejects malformed JSON and non-array responses", async () => {
    const fetchMock = vi.mocked(fetch);
    const headers = { "X-WP-Total": "1", "X-WP-TotalPages": "1" };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(headers),
      json: vi.fn().mockRejectedValue(new SyntaxError("bad json")),
    } as unknown as Response);
    await expect(fetchAllProperties()).rejects.toThrow(/invalid JSON/);

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ properties: [makePost(1)] }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    }));
    await expect(fetchAllProperties()).rejects.toThrow(/expected an array/);

    fetchMock.mockResolvedValue(new Response(JSON.stringify([{ id: 1 }]), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    }));
    await expect(fetchAllProperties()).rejects.toThrow(/invalid property/);
  });

  it("rejects missing records and duplicate IDs across pages", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      if (page === 1) return jsonResponse(Array.from({ length: 200 }, (_, index) => makePost(index + 1)), 201);
      return jsonResponse([], 201);
    });
    await expect(fetchAllProperties()).rejects.toThrow(/expected 1/);

    fetchMock.mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      if (page === 1) return jsonResponse(Array.from({ length: 200 }, (_, index) => makePost(index + 1)), 201);
      return jsonResponse([makePost(1)], 201);
    });
    await expect(fetchAllProperties()).rejects.toThrow(/appeared more than once/);
  });

  it("rejects inconsistent totals between pages", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const page = Number(new URL(String(input)).searchParams.get("page"));
      const total = page === 1 ? 201 : 202;
      const pageRecords = page === 1
        ? Array.from({ length: 200 }, (_, index) => makePost(index + 1))
        : [makePost(201)];
      return jsonResponse(pageRecords, total);
    });

    await expect(fetchAllProperties()).rejects.toThrow(/totals changed/);
  });
});
