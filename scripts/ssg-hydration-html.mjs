export function serializeForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function addPrerenderHydration(html, route, queryState) {
  if (!queryState) {
    throw new Error(`[SSG] Route ${route} did not provide query state for hydration.`);
  }

  const payload = serializeForInlineScript({ route, queryState });
  const script = `<script>window.__PRERENDER_HYDRATION__=${payload};</script>`;
  if (!html.includes("</head>")) {
    throw new Error(`[SSG] Route ${route} HTML has no closing head tag for hydration state.`);
  }
  return html.replace("</head>", `${script}</head>`);
}
