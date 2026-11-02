/// <reference types="vite/client" />

import type { DehydratedState } from "@tanstack/react-query";

declare global {
  interface Window {
    __PRERENDER_READY_FIRED?: boolean;
    __PRERENDER_INJECTED?: {
      isPrerendering?: boolean;
    };
    __PRERENDER_QUERY_STATE__?: DehydratedState;
    __PRERENDER_HYDRATION__?: {
      route: string;
      queryState: DehydratedState;
    };
  }
}
