import { useEffect } from "react";
import { useLocation, BrowserRouter, Routes, Route } from "react-router-dom";
import { Helmet, HelmetProvider } from "react-helmet-async";
import CookieConsent from "react-cookie-consent";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";

import Header from "@/components/Header";
import Hero from "@/components/Hero";
import FeaturedProperties from "@/components/FeaturedProperties";
import About from "@/components/About";
import Services from "@/components/Services";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import PropertiesPage from "./pages/PropertiesPage";
import PropertyDetailPage from "./pages/PropertyDetailPage";
import NotFound from "./pages/NotFound";
import { SearchProvider } from "@/context/SearchContext";
import { useProperties, useAllProperties, usePrerenderedProperties } from "@/hooks/useProperties";
import { capturePrerenderQueryState, queryClient, savePrerenderPropertySeed } from "@/ssg-hydration";
import { PROPERTY_LISTING_ROUTES } from "@/data/propertyListingRoutes";


const Index = () => {
  const location = useLocation();
  const {
    data: initialProperties = [],
    isLoading,
    isSuccess: isInitialSuccess,
    isFetching: isInitialFetching,
  } = useProperties();
  const {
    data: allPropertiesFull,
    isSuccess: isAllSuccess,
    isFetching: isAllFetching,
  } = useAllProperties();
  const { data: prerenderedProperties } = usePrerenderedProperties();
  const currentRoute = window.location.pathname.replace(/\/+$/, "") || "/";
  const hydratedRoute = window.__PRERENDER_HYDRATION__?.route.replace(/\/+$/, "") || "";
  const isHydratedSsgRoute = currentRoute === hydratedRoute && window.location.search === "";
  const properties = allPropertiesFull ?? (isHydratedSsgRoute ? prerenderedProperties : undefined) ?? initialProperties;

  useEffect(() => {
    if (isInitialSuccess && !isInitialFetching && isAllSuccess && !isAllFetching) {
      savePrerenderPropertySeed(allPropertiesFull ?? []);
      capturePrerenderQueryState();
      window.__PRERENDER_READY_FIRED = true;
      document.dispatchEvent(new Event('prerender-ready'));
    }
  }, [isInitialSuccess, isInitialFetching, isAllSuccess, isAllFetching, allPropertiesFull]);

  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
      }
    }
  }, [location]);

  return (
    <SearchProvider properties={properties} isLoading={isLoading}>
      <Helmet>
        <title>Casa Pronto | Agenție Imobiliară Alba Iulia</title>
        <meta name="description" content="Agenția Imobiliară Casa Pronto din Alba Iulia. Găsește cele mai noi oferte de apartamente, case, terenuri și spații comerciale." />
        <meta property="og:title" content="Casa Pronto | Agenție Imobiliară Alba Iulia" />
        <meta property="og:description" content="Agenția Imobiliară Casa Pronto din Alba Iulia. Găsește cele mai noi oferte de apartamente, case, terenuri și spații comerciale." />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="min-h-screen">
        <Header />
        <main>
          <Hero />
          <FeaturedProperties />
          <About />
          <Services />
          <Contact />
        </main>
        <Footer />
      </div>
    </SearchProvider>
  );
};

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <CookieConsent
            location="bottom"
            buttonText="Accept Toate"
            enableDeclineButton
            declineButtonText="Refuz"
            cookieName="casa_pronto_cookie_consent"
            disableStyles={true}
            containerClasses="fixed bottom-0 left-0 w-full bg-background/95 backdrop-blur-md border-t border-border shadow-lg z-50 p-4 md:px-8 md:py-6 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-8"
            contentClasses="text-sm text-muted-foreground flex-1 text-center md:text-left text-balance"
            buttonWrapperClasses="flex flex-row items-center gap-3 w-full md:w-auto justify-center"
            buttonClasses="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-md font-medium text-sm transition-colors cursor-pointer w-full md:w-auto whitespace-nowrap"
            declineButtonClasses="bg-transparent text-foreground border border-border hover:bg-muted px-6 py-2.5 rounded-md font-medium text-sm transition-colors cursor-pointer w-full md:w-auto whitespace-nowrap"
          >
            Folosim cookie-uri pentru a-ți oferi cea mai bună experiență pe site-ul nostru, pentru a analiza traficul și pentru a personaliza conținutul. Prin continuarea navigării, ești de acord cu utilizarea acestora.
          </CookieConsent>
          <Routes>
            <Route path="/" element={<Index />} />
            {PROPERTY_LISTING_ROUTES.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={<PropertiesPage tip={route.tip} zone={route.zone} />}
              />
            ))}
            <Route path="/proprietate/:id" element={<PropertyDetailPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
