"use client";
import { useState, useMemo, useEffect, useTransition, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { MapPin, Bed, Bath, Square, ArrowRight, Search, Phone, Mail, ChevronRight, Grid3X3, List, SlidersHorizontal, Loader2 } from "lucide-react";
import PropertyImageCarousel from "@/components/PropertyImageCarousel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { type Property } from "@/data/properties";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SearchProvider } from "@/context/SearchContext";
import { useInitialProperties, useAllProperties, useTaxonomies } from "@/hooks/useProperties";
import { PropertyGridSkeletons, PropertyRowSkeletons } from "@/components/PropertyCardSkeleton";
import { matchesTaxonomy } from "@/hooks/useTaxonomyOptions";
import { useDebounce } from "@/hooks/useDebounce";

type FilterTab = "toate" | "cumparare" | "inchiriere" | "vandute";
type ViewMode = "grid" | "list";
type SortOption = "newest" | "oldest" | "price-high" | "price-low";

import type { TaxonomyTerm } from "@/lib/api/wordpress";

type RawTaxonomy = TaxonomyTerm | string;
type ParsedTaxonomy = { value: string; label: string; termData?: TaxonomyTerm };

function toSlug(input: any): string {
  if (!input) return "";
  const str = typeof input === "string" ? input : (input?.name || "");
  return str
    .toLowerCase()
    .replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i")
    .replace(/ș/g, "s").replace(/ț/g, "t")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function matchTab(p: Property, tab: FilterTab): boolean {
  if (tab === "toate") return true;
  const statuses = p.taxonomies?.property_status ?? [];
  const statusSlugs = statuses.map((s: any) => {
    const val = typeof s === 'string' ? s : (s?.name || "");
    return val.toLowerCase();
  });
  switch (tab) {
    case "cumparare": return statusSlugs.some(s => s.includes("cumpar") || s.includes("vanzar") || s.includes("vânzar"));
    case "inchiriere": return statusSlugs.some(s => s.includes("inchiri") || s.includes("închiri"));
    case "vandute": return statusSlugs.some(s => s.includes("vandu") || s.includes("vându") || s.includes("vandut") || s.includes("vândut"));
    default: return true;
  }
}

const PropertyRow = ({ property, search, priority }: { property: Property; search: string; priority?: boolean }) => (
  <Link href={`/proprietate/${property.id}${search}`} className="block">
    <article className="bg-card rounded-xl overflow-hidden shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-hover)] transition-all duration-300 flex flex-col md:flex-row animate-fade-up">
      <PropertyImageCarousel
        images={property.images?.length > 0 ? property.images : [property.image]}
        alt={property.title}
        className="md:w-80 flex-shrink-0 relative"
        aspectClass="aspect-[4/3] md:aspect-auto md:min-h-[200px]"
        priority={priority}
      >
        <div className="absolute top-3 left-3 flex gap-2 pointer-events-none z-[5]">
          <Badge variant={property.type === "Vânzare" ? "default" : property.type === "Închiriere" ? "secondary" : "outline"}
            className={cn("text-xs", property.type === "Vândut" && "bg-foreground/80 text-background")}>
            {property.type}
          </Badge>
          {property.isNew && <Badge className="bg-accent text-accent-foreground text-xs">Nou</Badge>}
        </div>

        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg font-bold text-sm md:text-base z-[5] pointer-events-none flex items-baseline gap-1">
          <span>{property.price.replace("€", "").trim()}</span>
          <span className="text-xs">€</span>
          {property.type === "Închiriere" && (
            <span className="text-[10px] font-normal opacity-90 ml-0.5">/lună</span>
          )}
        </div>
      </PropertyImageCarousel>

      <div className="flex-1 p-5 flex flex-col justify-between min-w-0">
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-1">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{property.location}</span>
          </div>
          <h3 className="font-serif text-lg font-semibold text-foreground hover:text-primary transition-colors line-clamp-1">
            {property.title}
          </h3>
          <p className="text-muted-foreground text-sm mt-2 line-clamp-2">
            Agentia Imobiliară Casa Pronto oferă spre {property.type === "Închiriere" ? "închiriere" : "vânzare"} {property.title.toLowerCase()}, zona {property.location.split(",")[0]}. Suprafața imobilului este de {property.area} mp.
          </p>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border gap-2">
          <div className="flex items-center gap-3 sm:gap-5 overflow-hidden">
            <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground flex-shrink-0">
              <Square className="h-4 w-4" />
              <span>{property.area} m²</span>
            </div>
            {property.beds > 0 && (
              <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground flex-shrink-0">
                <Bed className="h-4 w-4" />
                <span>{property.beds} Cam.</span>
              </div>
            )}
            {property.baths > 0 && (
              <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground flex-shrink-0">
                <Bath className="h-4 w-4" />
                <span>{property.baths} {property.baths === 1 ? 'Baie' : 'Băi'}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-baseline gap-1 whitespace-nowrap">
              <span className="font-bold text-lg sm:text-xl text-primary leading-none">
                {property.price.replace("€", "").trim()}
              </span>
              <span className="text-[11px] sm:text-xs font-semibold text-primary">€</span>
              {property.type === "Închiriere" && (
                <span className="text-[10px] sm:text-xs font-normal text-muted-foreground leading-none">
                  /lună
                </span>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </div>
        </div>
      </div>
    </article>
  </Link>
);

const PropertyGrid = ({ property, search, priority }: { property: Property; search: string; priority?: boolean }) => (
  <Link href={`/proprietate/${property.id}${search}`} className="block">
    <article className="bg-card rounded-xl overflow-hidden shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-hover)] transition-all duration-300 animate-fade-up">
      <PropertyImageCarousel
        images={property.images?.length > 0 ? property.images : [property.image]}
        alt={property.title}
        aspectClass="aspect-[4/3]"
        priority={priority}
      >
        <div className="absolute top-3 left-3 flex gap-2 pointer-events-none z-[5]">
          <Badge variant={property.type === "Vânzare" ? "default" : property.type === "Închiriere" ? "secondary" : "outline"}
            className={cn("text-xs", property.type === "Vândut" && "bg-foreground/80 text-background")}>
            {property.type}
          </Badge>
          {property.isNew && <Badge className="bg-accent text-accent-foreground text-xs">Nou</Badge>}
        </div>

        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg font-bold text-sm md:text-base z-[5] pointer-events-none flex items-baseline gap-1">
          <span>{property.price.replace("€", "").trim()}</span>
          <span className="text-xs font-semibold">€</span>
          {property.type === "Închiriere" && (
            <span className="text-[10px] font-normal opacity-90 ml-0.5">/lună</span>
          )}
        </div>
      </PropertyImageCarousel>

      <div className="p-4">
        <h3 className="font-serif text-base font-semibold text-foreground line-clamp-1 hover:text-primary transition-colors">{property.title}</h3>
        <div className="flex items-center gap-1.5 text-muted-foreground mt-1.5">
          <MapPin className="h-3.5 w-3.5" />
          <span className="text-sm truncate">{property.location}</span>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border overflow-hidden">
          {property.beds > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <Bed className="h-3.5 w-3.5" />
              <span>{property.beds}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
            <Bath className="h-3.5 w-3.5" />
            <span>{property.baths}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
            <Square className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">{property.area} mp</span>
          </div>

          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <div className="items-baseline gap-0.5 whitespace-nowrap hidden sm:flex">
              <span className="font-bold text-sm text-primary leading-none">
                {property.price.replace("€", "").trim()}
              </span>
              <span className="text-[10px] font-semibold text-primary">€</span>
              {property.type === "Închiriere" && (
                <span className="text-[9px] font-normal text-muted-foreground leading-none">
                  /lună
                </span>
              )}
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>
    </article>
  </Link>
);

interface FilterSelectsProps {
  mobile?: boolean;
  tip: string;
  setTip: (v: string) => void;
  propertyTypes: { value: string; label: string }[];
  zone: string;
  setZone: (v: string) => void;
  zones: { value: string; label: string }[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
}

const FilterSelects = ({ mobile = false, tip, setTip, propertyTypes, zone, setZone, zones, searchQuery, setSearchQuery }: FilterSelectsProps) => {
  const h = mobile ? "h-11" : "h-10";
  return (
    <>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Categorie</label>
        <Select value={tip || "all"} onValueChange={(v) => setTip(v === "all" ? "" : v)}>
          <SelectTrigger className={h}>
            <SelectValue placeholder="Toate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate</SelectItem>
            {propertyTypes.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Zonă</label>
        <Select value={zone || "all"} onValueChange={(v) => setZone(v === "all" ? "" : v)}>
          <SelectTrigger className={h}>
            <SelectValue placeholder="Toate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Caută</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Caută anunțuri..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn("pl-10 text-[16px] md:text-sm w-full box-border", h)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
          />
        </div>
      </div>
    </>
  );
};

const ITEMS_PER_PAGE = 12;

// Am adăugat parametrul din rută (routeTip)
const PropertyListingsInteractiveInner = ({ tip: routeTip, zone: routeZone, initialProperties = [] }: { tip?: string; zone?: string; initialProperties?: Property[] }) => {
  const isLoadingInitial = false;
  const { data: taxonomyData } = useTaxonomies();
  const { data: allPropertiesFull, isFetched: isAllFetched } = useAllProperties(true);

  const hasFullData = isAllFetched && !!allPropertiesFull;
  const allProperties = hasFullData ? allPropertiesFull : initialProperties;

  useEffect(() => {
    if (taxonomyData) {
      console.log('Taxonomies loaded:', taxonomyData);
    }
  }, [taxonomyData]);

  useEffect(() => {
    if (allPropertiesFull) {
      console.log('Background fetch complete, total items:', allPropertiesFull.length);
    }
  }, [allPropertiesFull]);

  // Semnal pentru Vite Prerender (SSG) - Declansat cand sunt gata datele
  useEffect(() => {
    if (initialProperties.length > 0 || isAllFetched) {
      const timer = setTimeout(() => {
        (window as any).__PRERENDER_READY_FIRED = true;
        document.dispatchEvent(new Event('prerender-ready'));
      }, 1000); // mic delay ca să se randeze și pozele în DOM
      return () => clearTimeout(timer);
    }
  }, [initialProperties, isAllFetched]);

  // Absolute 5s Fallback pentru subcategorii cu 0 rezultate (Evită timeout-ul Puppeteer)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!(window as any).__PRERENDER_READY_FIRED) {
        (window as any).__PRERENDER_READY_FIRED = true;
        document.dispatchEvent(new Event('prerender-ready'));
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const zones = useMemo(() => {
    const rawZones = taxonomyData?.property_city || [];
    return rawZones.map((z: RawTaxonomy) => {
      const isObj = typeof z === 'object' && z !== null;
      const label = isObj && z.name ? z.name : (typeof z === 'string' ? z : "");
      const slug = isObj && z.slug ? z.slug : "";
      return {
        value: slug || toSlug(label),
        label: label,
        termData: isObj ? z : undefined
      };
    }).filter((item: ParsedTaxonomy) => item.label !== "")
      .sort((a: ParsedTaxonomy, b: ParsedTaxonomy) => a.label.localeCompare(b.label, "ro"));
  }, [taxonomyData]);

  const propertyTypes = useMemo(() => {
    const rawTypes = taxonomyData?.property_type || [];
    return rawTypes.map((t: RawTaxonomy) => {
      const isObj = typeof t === 'object' && t !== null;
      const label = isObj && t.name ? t.name : (typeof t === 'string' ? t : "");
      const slug = isObj && t.slug ? t.slug : "";
      return {
        value: slug || toSlug(label),
        label: label,
        termData: isObj ? t : undefined
      };
    }).filter((item: ParsedTaxonomy) => item.label !== "")
      .sort((a: ParsedTaxonomy, b: ParsedTaxonomy) => a.label.localeCompare(b.label, "ro"));
  }, [taxonomyData]);

  const statuses = useMemo(() => {
    const rawStatuses = taxonomyData?.property_status || [];
    return rawStatuses.map((s: RawTaxonomy) => {
      const isObj = typeof s === 'object' && s !== null;
      const label = isObj && s.name ? String(s.name) : (typeof s === 'string' ? s : "");
      const slug = isObj && s.slug ? String(s.slug) : "";
      return {
        value: slug || toSlug(label),
        label: label
      };
    }).filter(item => item.label !== "")
      .sort((a, b) => a.label.localeCompare(b.label, "ro"));
  }, [taxonomyData]);

  const searchParams = useSearchParams();
  const router = useRouter();
  // Guard: don't fire the sync-params navigate() on the very first render.
  // Without this, the two competing useEffects (lines 406 + 418) race each other
  // on mount and cause tip !== routeTip → immediate redirect to /proprietati.
  const isMounted = useRef(false);
  const [activeTab, setActiveTab] = useState<FilterTab>((searchParams.get("tab") as FilterTab) || "toate");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [zone, setZone] = useState(routeZone || searchParams.get("zone") || "");

  // Aici setăm categoria luând în considerare și prop-ul primit din rută (ex. "case-de-vanzare")
  const [tip, setTip] = useState(routeTip || searchParams.get("tip") || "");
  const [rooms, setRooms] = useState(searchParams.get("rooms") || "");
  const [area, setArea] = useState(searchParams.get("area") || "");
  const [price, setPrice] = useState(searchParams.get("price") || "");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Sync route props → local state when React Router navigates to a new fixed route.
  // Dependency array intentionally excludes searchParams to avoid feedback loops.
  const isFirstRouteSync = useRef(true);
  useEffect(() => {
    if (isFirstRouteSync.current) {
      isFirstRouteSync.current = false;
      return;
    }
    setTip(routeTip || "");
    setZone(routeZone || "");
  }, [routeTip, routeZone]);

  // Sync global URL search params -> local search query
  // This allows the Header's search bar to update the PropertiesPage seamlessly.
  // We only update if urlQ differs from debouncedSearch to avoid overriding the user's active local typing.
  useEffect(() => {
    const urlQ = searchParams.get("q") || "";
    if (urlQ !== debouncedSearch && urlQ !== searchQuery) {
      setSearchQuery(urlQ);
    }
  }, [searchParams.get("q")]); // Explicitly depend only on the "q" parameter

  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem("preferintaViewCasaPronto");
      if (savedMode === "grid" || savedMode === "list") return savedMode;
      return window.innerWidth < 768 ? "grid" : "list";
    }
    return "grid";
  });

  useEffect(() => {
    localStorage.setItem("preferintaViewCasaPronto", viewMode);
  }, [viewMode]);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [isPending, startTransition] = useTransition();

  const hasTaxonomyFilter = !!(zone || tip || activeTab !== "toate");
  const hasActiveFilter = !!(zone || tip || rooms || area || price || debouncedSearch || activeTab !== "toate");

  const isWaitingForFullData = hasActiveFilter && !hasFullData && !isLoadingInitial;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Sync filter state → URL search params.
  // Uses functional updater to only touch the specific params we own,
  // preserving any other existing params (e.g. ?tip= from footer links).
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    const params = new URLSearchParams(searchParams?.toString() || "");
    // activeTab
    if (activeTab && activeTab !== "toate") params.set("tab", activeTab);
    else params.delete("tab");
    // zone (only write to URL if not coming from a fixed route)
    if (zone && !routeZone) params.set("zone", zone);
    else if (!routeZone) params.delete("zone");
    // tip (same)
    if (tip && !routeTip) params.set("tip", tip);
    else if (!routeTip) params.delete("tip");
    // other filters
    if (rooms) params.set("rooms", rooms); else params.delete("rooms");
    if (area) params.set("area", area); else params.delete("area");
    if (price) params.set("price", price); else params.delete("price");
    if (debouncedSearch) params.set("q", debouncedSearch); else params.delete("q");
    
    router.replace(`/proprietati?${params.toString()}`, { scroll: false });
  }, [activeTab, zone, tip, rooms, area, price, debouncedSearch, routeTip, routeZone, router, searchParams]);

  // When user changes tip/zone on a fixed route, escape to /proprietati with query params.
  // These handlers are passed to FilterSelects instead of raw setTip/setZone.
  const handleSetTip = useCallback((newCat: string) => {
    if (routeTip && newCat !== routeTip) {
      const params = new URLSearchParams();
      if (activeTab && activeTab !== "toate") params.set("tab", activeTab);
      if (zone) params.set("zone", zone);
      if (newCat) params.set("tip", newCat);
      router.replace(`/proprietati?${params.toString()}`);
    } else {
      setTip(newCat);
    }
  }, [routeTip, activeTab, zone, router]);

  const handleSetZone = useCallback((newZone: string) => {
    if (routeZone && newZone !== routeZone) {
      const params = new URLSearchParams();
      if (activeTab && activeTab !== "toate") params.set("tab", activeTab);
      if (tip) params.set("tip", tip);
      if (newZone) params.set("zone", newZone);
      router.replace(`/proprietati?${params.toString()}`);
    } else {
      setZone(newZone);
    }
  }, [routeZone, activeTab, tip, router]);

  const currentSearch = useMemo(() => {
    const params = new URLSearchParams();
    if (activeTab && activeTab !== "toate") params.set("tab", activeTab);
    if (zone) params.set("zone", zone);
    if (tip && !routeTip) params.set("tip", tip);
    if (rooms) params.set("rooms", rooms);
    if (area) params.set("area", area);
    if (price) params.set("price", price);
    if (debouncedSearch) params.set("q", debouncedSearch);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }, [activeTab, zone, tip, rooms, area, price, debouncedSearch, routeTip]);

  const resetAllFilters = () => {
    startTransition(() => {
      setActiveTab("toate");
      setSearchQuery("");
      setZone("");
      if (!routeTip) setTip(""); // Resetează categoria doar dacă nu e din rută fixă
      setRooms("");
      setArea("");
      setPrice("");
      setVisibleCount(ITEMS_PER_PAGE);
    });
  };

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [activeTab, zone, tip, rooms, area, price, debouncedSearch, sortBy]);

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "toate", label: "TOATE" },
    { id: "cumparare", label: "CUMPĂRĂRI" },
    { id: "inchiriere", label: "ÎNCHIRIERI" },
    { id: "vandute", label: "VÂNDUTE" },
  ];

  const filteredProperties = useMemo(() => {
    const sourceData = allPropertiesFull ?? initialProperties;

    const normalizeText = (text: string | number | null | undefined) => {
      if (!text) return "";
      return String(text)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    };

    const stopWords = ["cu", "in", "de", "la", "pe", "si", "un", "o", "din", "pentru", "zona", "euro", "lei", "€"];

    const searchTerms = debouncedSearch
      ? normalizeText(debouncedSearch.replace(/€/g, " "))
        .replace(/(\d)\s+(?=\d)/g, "$1")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((term) => term.trim() !== "" && !stopWords.includes(term))
      : [];

    const result = sourceData.filter((p) => {
      if (!matchTab(p, activeTab)) return false;
      if (zone && !matchesTaxonomy(p, "property_city", zone)) return false;
      if (tip && !matchesTaxonomy(p, "property_type", tip)) return false;

      if (rooms) {
        if (rooms === "4+") {
          if (Number(p.beds) < 4) return false;
        } else {
          if (Number(p.beds) !== Number(rooms)) return false;
        }
      }

      if (area) {
        const a = p.area;
        const areaRanges: Record<string, [number, number]> = {
          "sub-1000": [0, 1000], "1000-2000": [1000, 2000], "2000-3000": [2000, 3000],
          "3000-4000": [3000, 4000], "4000-5000": [4000, 5000], "5000-6000": [5000, 6000],
          "6000-7000": [6000, 7000], "7000-8000": [7000, 8000], "peste-8000": [8000, Infinity],
        };
        const range = areaRanges[area];
        if (range && (a < range[0] || a >= range[1])) return false;
      }

      if (price) {
        const pv = p.priceValue;
        const priceRanges: Record<string, [number, number]> = {
          "sub-200": [0, 200], "200-300": [200, 300], "300-400": [300, 400],
          "400-500": [400, 500], "500-700": [500, 700], "700-1000": [700, 1000], "peste-1000": [1000, Infinity],
          "sub-25000": [0, 25000], "25000-50000": [25000, 50000], "50000-75000": [50000, 75000],
          "75000-100000": [75000, 100000], "100000-150000": [100000, 150000],
          "150000-200000": [150000, 200000], "200000-300000": [200000, 300000], "peste-300000": [300000, Infinity],
        };
        const range = priceRanges[price];
        if (range && (pv < range[0] || pv >= range[1])) return false;
      }

      if (searchTerms.length > 0) {
        const rawId = p.id.toString();
        const displayId = (Number(p.id) + 10000).toString();
        const cleanPrice = p.price ? p.price.toString().replace(/\D/g, '') : '';

        const rawText = [
          p.title, p.location, p.propertyType,
          p.beds ? `${p.beds} camere camera` : "",
          p.baths ? `${p.baths} bai baie` : "",
          p.area ? `${p.area} mp m2 metri` : "",
          JSON.stringify(p.taxonomies || {})
        ].join(" ");

        const superString = normalizeText(rawText).replace(/casa pronto/g, "");

        const matchesAllTerms = searchTerms.every((term) => {
          let matched = superString.includes(term);
          if (!matched && /^\d+$/.test(term)) {
            matched = term === rawId || term === displayId || term === cleanPrice;
          }
          return matched;
        });

        if (!matchesAllTerms) return false;
      }

      return true;
    });

    switch (sortBy) {
      case "price-high": result.sort((a, b) => b.priceValue - a.priceValue); break;
      case "price-low": result.sort((a, b) => a.priceValue - b.priceValue); break;
      case "oldest": result.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()); break;
      default: result.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()); break;
    }

    return result;
  }, [activeTab, zone, tip, rooms, area, price, debouncedSearch, sortBy, allPropertiesFull, initialProperties]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 18;

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredProperties.length]);

  const totalPages = Math.ceil(filteredProperties.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;

  const currentItems = filteredProperties.slice(indexOfFirstItem, indexOfLastItem);

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getTipLabel = () => {
    if (tip) {
      const cat = propertyTypes.find(c => c.value === tip);
      return cat?.label || "Anunțuri Imobiliare";
    }
    return "Anunțuri Imobiliare";
  };

  // SEO: Funcție pentru a da Titlul Corect în funcție de filtrele active (pentru Google)
  const getPageTitle = () => {
    let catLabel = "Anunțuri Imobiliare";
    if (tip) {
      const foundCat = propertyTypes.find(c => c.value === tip);
      catLabel = foundCat ? foundCat.label : tip;
      catLabel = catLabel.charAt(0).toUpperCase() + catLabel.slice(1).replace(/-/g, ' ');
    }

    let zoneLabel = "Alba Iulia și împrejurimi";
    if (zone) {
      const foundZone = zones.find(z => z.value === zone);
      zoneLabel = foundZone ? foundZone.label : zone;
      zoneLabel = zoneLabel.charAt(0).toUpperCase() + zoneLabel.slice(1).replace(/-/g, ' ');
    } else if (tip) {
      zoneLabel = "Alba Iulia";
    }

    let actionLabel = "de vânzare și închiriere";
    if (activeTab === "cumparare") actionLabel = "de vânzare";
    else if (activeTab === "inchiriere") actionLabel = "de închiriat";
    else if (activeTab === "vandute") actionLabel = "vândute";

    if (!tip && !zone && activeTab === "toate") {
      return "Anunțuri Imobiliare de vânzare și închiriere Alba Iulia și împrejurimi | Casa Pronto";
    }

    if (!tip) {
      return `Anunțuri Imobiliare ${actionLabel} ${zoneLabel} | Casa Pronto`;
    }

    return `${catLabel} ${actionLabel} ${zoneLabel} | Casa Pronto`;
  };

  const getPageDescription = () => {
    let catLabel = "proprietăți imobiliare";
    if (tip) {
      const foundCat = propertyTypes.find(c => c.value === tip);
      catLabel = foundCat ? foundCat.label.toLowerCase() : tip.replace(/-/g, ' ').toLowerCase();
    }

    let actionLabel = "de vânzare și închiriere";
    if (activeTab === "cumparare") actionLabel = "de vânzare";
    else if (activeTab === "inchiriere") actionLabel = "de închiriat";
    else if (activeTab === "vandute") actionLabel = "vândute";

    let zoneLabel = "Alba Iulia";
    if (zone) {
      const foundZone = zones.find(z => z.value === zone);
      zoneLabel = foundZone ? foundZone.label : zone.replace(/-/g, ' ');
      zoneLabel = zoneLabel.charAt(0).toUpperCase() + zoneLabel.slice(1);
    }

    if (!tip && !zone && activeTab === "toate") {
      return "Vezi cele mai noi oferte de proprietăți imobiliare din Alba Iulia. Găsește-ți casa de vis cu Casa Pronto!";
    }

    return `Vezi cele mai noi oferte de ${catLabel} ${actionLabel} în ${zoneLabel}. Găsește-ți casa de vis cu Casa Pronto!`;
  };

  const visibleProperties = useMemo(
    () => filteredProperties.slice(0, visibleCount),
    [filteredProperties, visibleCount]
  );
  const hasMoreLocal = visibleCount < filteredProperties.length;

  const filterSelectsProps = { tip, setTip: handleSetTip, propertyTypes, zone, setZone: handleSetZone, zones, searchQuery, setSearchQuery };

  const activeTerm = useMemo(() => {
    if (routeZone) return zones.find(z => z.value === routeZone)?.termData;
    if (routeTip) return propertyTypes.find(c => c.value === routeTip)?.termData;
    return undefined;
  }, [routeZone, routeTip, zones, propertyTypes]);

  const isFiltering = activeTab !== "toate" || (tip && tip !== routeTip) || (zone && zone !== routeZone);

  const seoTitle = (!isFiltering && activeTerm?.seo?.title) ? activeTerm.seo.title : getPageTitle();
  const seoDesc = (!isFiltering && activeTerm?.seo?.description) ? activeTerm.seo.description : getPageDescription();
  const getCanonicalUrl = () => {
    let base = activeTerm?.seo?.canonical_url || `https://casapronto.ro/${routeTip ? `${routeTip}${routeZone ? `-${routeZone}` : ''}` : 'proprietati'}`;
    if (!routeTip && !routeZone) {
      const whitelist = ['tip', 'zone', 'tab', 'rooms', 'area', 'price', 'q'];
      const params = new URLSearchParams();
      whitelist.forEach(key => {
        const val = searchParams.get(key);
        if (val) params.set(key, val);
      });
      const qs = params.toString();
      if (qs) base += `?${qs}`;
    }
    return base;
  };
  const canonical = getCanonicalUrl();
  const ogTitle = (!isFiltering && activeTerm?.seo?.og_title) ? activeTerm.seo.og_title : seoTitle;
  const ogDesc = (!isFiltering && activeTerm?.seo?.og_description) ? activeTerm.seo.og_description : seoDesc;

  return (
    <SearchProvider properties={initialProperties} isLoading={isLoadingInitial}>

      {/* SEO is handled by Next.js generateMetadata */}

      <div className="min-h-screen flex flex-col">
        <Header />

        {/* Page Header */}
        <div className="bg-muted/50 pt-36 pb-8 border-b border-border">
          <div className="container mx-auto px-4">
            <h1 className="font-serif text-3xl md:text-4xl font-bold">{getTipLabel()} Alba Iulia</h1>
            <nav className="flex items-center gap-2 mt-3 text-sm text-muted-foreground mb-6">
              <Link href="/" className="hover:text-primary transition-colors">Casa Pronto</Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <Link href="/proprietati" onClick={resetAllFilters} className="hover:text-primary transition-colors">Anunțuri Imobiliare</Link>
              {tip && (
                <>
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span className="text-foreground">{getTipLabel()}</span>
                </>
              )}
            </nav>
            {/* Term Description Box */}
            {activeTerm?.description && (
              <div
                className="prose prose-sm md:prose-base max-w-4xl text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: activeTerm.description }}
              />
            )}
          </div>
        </div>

        {/* Tabs + Sort Bar */}
        <div className="bg-background border-b border-border sticky top-[85px] md:top-[calc(2rem+5rem)] z-30">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between py-3 gap-3">
              <div className="flex gap-2 bg-muted/40 p-1 rounded-xl overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 flex-shrink-0">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => startTransition(() => setActiveTab(tab.id))}
                    disabled={isPending}
                    className={cn(
                      "flex-shrink-0 whitespace-nowrap px-5 py-2.5 text-sm font-medium tracking-wider rounded-lg transition-all duration-200 font-serif min-h-[44px]",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:text-primary hover:bg-primary/10",
                      isPending && "opacity-70 cursor-wait"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Sortează:</span>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-44 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Nou → Vechi</SelectItem>
                    <SelectItem value="oldest">Vechi → Nou</SelectItem>
                    <SelectItem value="price-high">Preț (Mare - Mic)</SelectItem>
                    <SelectItem value="price-low">Preț (Mic - Mare)</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex border border-border rounded-md overflow-hidden ml-auto">
                  <button
                    onClick={() => setViewMode("list")}
                    className={cn("p-2 transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={cn("p-2 transition-colors", viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-background py-8">
          <div className="container mx-auto px-4">
            {/* Mobile Filter Button */}
            <div className="lg:hidden mb-4">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setIsFilterDrawerOpen(true)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filtrează
                {(tip || zone || debouncedSearch) && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {[tip, zone, debouncedSearch].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar - desktop only */}
              <aside className="hidden lg:block w-80 flex-shrink-0 space-y-6 order-last">
                <div className="bg-card rounded-xl p-6 shadow-[var(--card-shadow)] border border-border">
                  <h3 className="font-serif font-semibold text-lg mb-5">Filtre</h3>
                  <div className="space-y-4">
                    <FilterSelects {...filterSelectsProps} />
                    <Button className="w-full gap-2" onClick={() => { }}>
                      <Search className="h-4 w-4" />
                      CAUTĂ ANUNȚURI
                    </Button>
                  </div>
                </div>
                <div className="bg-card rounded-xl p-6 shadow-[var(--card-shadow)] border border-border">
                  <h3 className="font-serif font-semibold text-lg text-primary mb-1">Casa Pronto</h3>
                  <div className="w-12 h-1 bg-primary rounded-full mb-5" />
                  <div className="space-y-4 text-sm">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span>Alba Iulia, Calea Moților, Nr 59C</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <a href="tel:0740197476" className="hover:text-primary transition-colors">0740197476</a>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <a href="mailto:casa_pronto@yahoo.com" className="hover:text-primary transition-colors">casa_pronto@yahoo.com</a>
                    </div>
                  </div>
                </div>
              </aside>

              {/* Property List */}
              <div className="flex-1 relative">
                <p className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5 flex-wrap">
                  {isLoadingInitial ? (
                    "Se încarcă..."
                  ) : (
                    <>
                      <span>{filteredProperties.length} proprietăți</span>

                      {!hasFullData && (
                        <span className="text-primary font-medium text-xs md:text-sm animate-pulse">
                          (se încarcă mai multe...)
                        </span>
                      )}

                      {hasFullData && <span> din {allPropertiesFull!.length}</span>}
                    </>
                  )}
                  {isPending && <span className="ml-2 text-primary text-xs md:text-sm">Se actualizează...</span>}
                </p>

                {/* Eager User Loading Overlay */}
                {isWaitingForFullData && (
                  <div className="absolute inset-0 z-20 bg-background/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-4 min-h-[400px]">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <p className="text-lg font-serif font-medium text-foreground">Căutăm prin toate ofertele...</p>
                  </div>
                )}

                {isLoadingInitial ? (
                  viewMode === "list" ? (
                    <div className="flex flex-col gap-6">
                      <PropertyRowSkeletons count={4} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <PropertyGridSkeletons count={6} />
                    </div>
                  )
                ) : filteredProperties.length > 0 ? (
                  <>
                    {viewMode === "list" ? (
                      <div className="flex flex-col gap-6">
                        {currentItems.map((property, index) => (
                          <PropertyRow key={property.id} property={property} search={currentSearch} priority={index < 2} />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                        {currentItems.map((property, index) => (
                          <PropertyGrid key={property.id} property={property} search={currentSearch} priority={index < 2} />
                        ))}
                      </div>
                    )}

                    {/* PAGINAȚIA */}
                    {totalPages > 1 && (
                      <div className="flex justify-center items-center space-x-1 md:space-x-2 mt-10 mb-10">
                        <button
                          onClick={() => paginate(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="px-3 md:px-4 py-2 border rounded-lg bg-white text-gray-700 disabled:opacity-50 hover:bg-gray-50 transition-colors text-sm font-medium"
                        >
                          Înapoi
                        </button>

                        {[...Array(totalPages)].map((_, index) => {
                          const pageNum = index + 1;

                          if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                            return (
                              <button
                                key={pageNum}
                                onClick={() => paginate(pageNum)}
                                className={`px-3 md:px-4 py-2 rounded-lg border transition-colors text-sm font-medium ${currentPage === pageNum
                                  ? 'bg-[#c81e35] text-white border-[#c81e35]'
                                  : 'bg-white text-gray-700 hover:bg-gray-50'
                                  }`}
                              >
                                {pageNum}
                              </button>
                            );
                          }

                          if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                            return <span key={pageNum} className="px-1 md:px-2 text-gray-500">...</span>;
                          }

                          return null;
                        })}

                        <button
                          onClick={() => paginate(currentPage + 1)}
                          disabled={currentPage === totalPages}
                          className="px-3 md:px-4 py-2 border rounded-lg bg-white text-gray-700 disabled:opacity-50 hover:bg-gray-50 transition-colors text-sm font-medium"
                        >
                          Înainte
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-20 bg-muted/30 rounded-xl">
                    <p className="text-muted-foreground text-lg">Nu s-au găsit proprietăți cu filtrele selectate.</p>
                    <Button variant="outline" className="mt-4" onClick={resetAllFilters}>
                      Resetează Filtrele
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile Filter Fullscreen Overlay */}
            {isFilterDrawerOpen && (
              <div className="fixed inset-0 z-50 bg-background flex flex-col lg:hidden animate-in slide-in-from-bottom-full duration-300">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm flex-shrink-0">
                  <h2 className="font-serif text-xl font-bold tracking-tight">Filtre</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsFilterDrawerOpen(false)}
                    className="rounded-full h-10 w-10 hover:bg-muted"
                  >
                    <span className="text-2xl leading-none font-light mb-1">&times;</span>
                  </Button>
                </div>

                <div className="px-4 py-6 overflow-y-auto flex-1 overscroll-contain space-y-6">
                  <FilterSelects mobile {...filterSelectsProps} />
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Sortează</label>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                      <SelectTrigger className="h-11 text-[16px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Nou → Vechi</SelectItem>
                        <SelectItem value="oldest">Vechi → Nou</SelectItem>
                        <SelectItem value="price-high">Preț (Mare - Mic)</SelectItem>
                        <SelectItem value="price-low">Preț (Mic - Mare)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div
                  className="p-4 border-t border-border bg-background flex gap-3 flex-shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]"
                  style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                >
                  <Button
                    variant="outline"
                    className="flex-1 h-12 text-base font-medium"
                    onClick={() => { resetAllFilters(); setIsFilterDrawerOpen(false); }}
                  >
                    Resetează
                  </Button>
                  <Button
                    className="flex-1 gap-2 h-12 text-base font-medium shadow-md"
                    onClick={() => setIsFilterDrawerOpen(false)}
                  >
                    <Search className="h-4 w-4" />
                    Aplică Filtre
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </SearchProvider>
  );
};

const PropertyListingsInteractive = (props: { tip?: string; zone?: string; initialProperties: Property[] }) => {
  return (
    <Suspense fallback={<div className="p-8 text-center">Se încarcă proprietățile...</div>}>
      <PropertyListingsInteractiveInner {...props} />
    </Suspense>
  );
};

export default PropertyListingsInteractive;