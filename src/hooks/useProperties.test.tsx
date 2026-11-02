import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAllProperties } from "@/hooks/useProperties";

describe("useAllProperties retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries the complete paginated fetch when refetch is called after failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 91,
        date: "2026-10-01T10:00:00",
        title: { rendered: "Apartament după retry" },
        content: { rendered: "Descriere" },
        featured_media: 0,
        gallery_urls: ["https://example.test/91.jpg"],
      }]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-WP-Total": "1",
          "X-WP-TotalPages": "1",
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useAllProperties(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("per_page=200&page=1");
    expect(result.current.data?.map(property => property.id)).toEqual([91]);

    unmount();
    queryClient.clear();
  });
});
