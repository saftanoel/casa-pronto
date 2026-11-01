import { fireEvent, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Property } from "@/data/properties";
import { useAllProperties, useInitialProperties, usePrerenderedProperties, useTaxonomies } from "@/hooks/useProperties";
import PropertiesPage from "@/pages/PropertiesPage";

vi.mock("@/hooks/useProperties", () => ({
  useAllProperties: vi.fn(),
  useInitialProperties: vi.fn(),
  usePrerenderedProperties: vi.fn(),
  useTaxonomies: vi.fn(),
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/PropertyImageCarousel", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const initialProperty: Property = {
  id: 41,
  image: "/property.jpg",
  images: ["/property.jpg"],
  title: "Apartament disponibil inițial",
  description: "Descriere",
  location: "Centru, Alba Iulia",
  zone: "centru",
  price: "80.000 €",
  priceValue: 80000,
  beds: 2,
  baths: 1,
  area: 70,
  type: "Vânzare",
  propertyType: "apartamente",
  isNew: false,
  features: [],
  agent: "Baba Elena",
  date: "2026-10-01T10:00:00",
  taxonomies: {
    property_type: ["apartamente"],
    property_status: ["cumparare"],
    property_city: ["centru"],
  },
};

function makeAlbaMicestiApartment(index: number): Property {
  return {
    ...initialProperty,
    id: 100 + index,
    title: `Apartament Alba Micesti ${index + 1}`,
    location: "Alba Micesti, Alba Iulia",
    zone: "alba-micesti",
    taxonomies: {
      ...initialProperty.taxonomies,
      property_city: ["alba-micesti"],
    },
  };
}

describe("PropertiesPage full-catalog failure", () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__PRERENDER_HYDRATION__;
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
    vi.mocked(useInitialProperties).mockReturnValue({
      data: [initialProperty],
      isLoading: false,
    } as ReturnType<typeof useInitialProperties>);
    vi.mocked(useTaxonomies).mockReturnValue({
      data: { property_city: [], property_type: [], property_status: [] },
    } as ReturnType<typeof useTaxonomies>);
    vi.mocked(usePrerenderedProperties).mockReturnValue({
      data: undefined,
    } as ReturnType<typeof usePrerenderedProperties>);
    refetch.mockResolvedValue(undefined);
    vi.mocked(useAllProperties).mockReturnValue({
      data: undefined,
      isFetched: true,
      isError: true,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useAllProperties>);
  });

  afterEach(() => {
    delete window.__PRERENDER_HYDRATION__;
    window.history.replaceState({}, "", "/");
  });

  it("shows initial properties and an error with a retry action instead of an infinite filter spinner", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/proprietati?tab=cumparare"]}>
          <PropertiesPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Nu am putut încărca toate ofertele");
    expect(screen.getByText("Apartament disponibil inițial")).toBeInTheDocument();
    expect(screen.queryByText("Căutăm prin toate ofertele...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reîncearcă încărcarea" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("treats a successfully loaded empty full catalog as data, not as an error", () => {
    vi.mocked(useAllProperties).mockReturnValue({
      data: [],
      isFetched: true,
      isError: false,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useAllProperties>);

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/proprietati"]}>
          <PropertiesPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByText("Nu s-au găsit proprietăți cu filtrele selectate.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Căutăm prin toate ofertele...")).not.toBeInTheDocument();
  });

  it("keeps hydrated Alba Micesti route results visible while the full catalog loads in the background", () => {
    const prerenderedProperties = Array.from({ length: 40 }, (_, index) => makeAlbaMicestiApartment(index));
    window.history.replaceState({}, "", "/apartamente-alba-micesti/");
    window.__PRERENDER_HYDRATION__ = {
      route: "/apartamente-alba-micesti",
      queryState: { mutations: [], queries: [] },
    };
    vi.mocked(useInitialProperties).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useInitialProperties>);
    vi.mocked(usePrerenderedProperties).mockReturnValue({
      data: prerenderedProperties,
    } as ReturnType<typeof usePrerenderedProperties>);
    vi.mocked(useAllProperties).mockReturnValue({
      data: undefined,
      isFetched: false,
      isError: false,
      isFetching: true,
      refetch,
    } as unknown as ReturnType<typeof useAllProperties>);

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/apartamente-alba-micesti/"]}>
          <PropertiesPage tip="apartamente" zone="alba-micesti" />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByText("Apartament Alba Micesti 1")).toBeInTheDocument();
    expect(screen.getByText("40 proprietăți")).toBeInTheDocument();
    expect(screen.queryByText("Căutăm prin toate ofertele...")).not.toBeInTheDocument();
    expect(document.querySelectorAll('a[href^="/proprietate/"]').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText("Apartament Alba Micesti 19")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByText("Apartament Alba Micesti 37")).toBeInTheDocument();
    expect(screen.getByText("40 proprietăți")).toBeInTheDocument();
    expect(screen.queryByText("Căutăm prin toate ofertele...")).not.toBeInTheDocument();
  });

  it("keeps hydrated route results visible and retryable after the background catalog fails", () => {
    const prerenderedProperties = Array.from({ length: 40 }, (_, index) => makeAlbaMicestiApartment(index));
    window.history.replaceState({}, "", "/apartamente-alba-micesti/");
    window.__PRERENDER_HYDRATION__ = {
      route: "/apartamente-alba-micesti",
      queryState: { mutations: [], queries: [] },
    };
    vi.mocked(useInitialProperties).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useInitialProperties>);
    vi.mocked(usePrerenderedProperties).mockReturnValue({
      data: prerenderedProperties,
    } as ReturnType<typeof usePrerenderedProperties>);
    vi.mocked(useAllProperties).mockReturnValue({
      data: undefined,
      isFetched: true,
      isError: true,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useAllProperties>);

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/apartamente-alba-micesti/"]}>
          <PropertiesPage tip="apartamente" zone="alba-micesti" />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByText("Apartament Alba Micesti 1")).toBeInTheDocument();
    expect(screen.getByText("40 proprietăți")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Nu am putut încărca toate ofertele");
    expect(screen.queryByText("Căutăm prin toate ofertele...")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reîncearcă încărcarea" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the exact 40 route matches after the full catalog succeeds", () => {
    const exactRouteProperties = Array.from({ length: 40 }, (_, index) => makeAlbaMicestiApartment(index));
    const unrelatedProperty: Property = {
      ...initialProperty,
      id: 999,
      title: "Apartament din altă zonă",
      zone: "centru",
      taxonomies: {
        ...initialProperty.taxonomies,
        property_city: ["centru"],
      },
    };
    window.history.replaceState({}, "", "/apartamente-alba-micesti/");
    window.__PRERENDER_HYDRATION__ = {
      route: "/apartamente-alba-micesti",
      queryState: { mutations: [], queries: [] },
    };
    vi.mocked(useInitialProperties).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useInitialProperties>);
    vi.mocked(usePrerenderedProperties).mockReturnValue({
      data: exactRouteProperties,
    } as ReturnType<typeof usePrerenderedProperties>);
    vi.mocked(useAllProperties).mockReturnValue({
      data: [...exactRouteProperties, unrelatedProperty],
      isFetched: true,
      isError: false,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useAllProperties>);

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/apartamente-alba-micesti/"]}>
          <PropertiesPage tip="apartamente" zone="alba-micesti" />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByText("Apartament Alba Micesti 1")).toBeInTheDocument();
    expect(screen.getByText("40 proprietăți")).toBeInTheDocument();
    expect(screen.queryByText("Căutăm prin toate ofertele...")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the full-catalog loading overlay for dynamic filtered searches", () => {
    window.history.replaceState({}, "", "/proprietati?zone=alba-micesti&tip=apartamente");
    window.__PRERENDER_HYDRATION__ = {
      route: "/proprietati",
      queryState: { mutations: [], queries: [] },
    };
    vi.mocked(useAllProperties).mockReturnValue({
      data: undefined,
      isFetched: false,
      isError: false,
      isFetching: true,
      refetch,
    } as unknown as ReturnType<typeof useAllProperties>);
    vi.mocked(useInitialProperties).mockReturnValue({
      data: [makeAlbaMicestiApartment(0)],
      isLoading: false,
    } as ReturnType<typeof useInitialProperties>);

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/proprietati?zone=alba-micesti&tip=apartamente"]}>
          <PropertiesPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByText("Apartament Alba Micesti 1")).toBeInTheDocument();
    expect(screen.getByText("Căutăm prin toate ofertele...")).toBeInTheDocument();
  });
});
