import { hydrateRoot, createRoot } from "react-dom/client";
import App from "./App.tsx";
import { hydratePrerenderQueryState } from "./ssg-hydration";
import "./index.css";

const rootElement = document.getElementById("root")!;

if (window.__PRERENDER_HYDRATION__) {
  hydratePrerenderQueryState(window.__PRERENDER_HYDRATION__.queryState);
}

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, <App />);
} else {
  createRoot(rootElement).render(<App />);
}
