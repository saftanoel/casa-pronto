import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 18765;
const API_PREFIX = "/wp-json/casapronto/v1";
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);
const MAX_LIMIT = 100;
const MAX_PER_PAGE = 200;
const DEFAULT_PER_PAGE = 10;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = resolve(projectRoot, "public");
const properties = JSON.parse(
  await readFile(resolve(fixtureDirectory, "prerender-properties.json"), "utf8"),
);
const taxonomies = JSON.parse(
  await readFile(resolve(fixtureDirectory, "prerender-taxonomies.json"), "utf8"),
);

if (!Array.isArray(properties)) {
  throw new TypeError("prerender-properties.json must contain a JSON array.");
}

for (const [index, property] of properties.entries()) {
  if (
    !property ||
    typeof property !== "object" ||
    !Number.isSafeInteger(property.id) ||
    property.id <= 0 ||
    typeof property.date !== "string" ||
    typeof property.title?.rendered !== "string" ||
    typeof property.content?.rendered !== "string"
  ) {
    throw new TypeError(`Invalid property fixture at position ${index + 1}.`);
  }
}

for (const key of ["property_city", "property_type", "property_status"]) {
  if (!Array.isArray(taxonomies?.[key])) {
    throw new TypeError(`prerender-taxonomies.json must contain an array named ${key}.`);
  }
}

const delayMs = readNonNegativeInteger(process.env.MOCK_DELAY_MS, "MOCK_DELAY_MS", 0);
const failPage = readPositiveDecimal(process.env.MOCK_FAIL_PAGE, "MOCK_FAIL_PAGE");

function readNonNegativeInteger(value, name, fallback) {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
  const normalized = normalizeDecimal(value);
  if (normalized.length > 9) {
    throw new TypeError(`${name} is too large.`);
  }
  return Number(normalized);
}

function normalizeDecimal(value) {
  return value.replace(/^0+/, "") || "0";
}

function readPositiveDecimal(value, name) {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  const normalized = normalizeDecimal(value);
  if (normalized === "0") {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return normalized;
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  const headers = { Vary: "Origin" };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Expose-Headers"] = "X-WP-Total, X-WP-TotalPages";
  }
  return headers;
}

function sendJson(request, response, status, value, additionalHeaders = {}) {
  response.writeHead(status, {
    ...corsHeaders(request),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...additionalHeaders,
  });
  response.end(JSON.stringify(value));
}

function sendError(request, response, status, code, message) {
  sendJson(request, response, status, {
    code,
    message,
    data: { status },
  });
}

function singleParameter(url, name) {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) {
    return { error: `${name} must be provided at most once.` };
  }
  return values.length === 0
    ? { present: false }
    : { present: true, value: values[0] };
}

function parsePositiveParameter(value, name, cap) {
  if (!/^\d+$/.test(value)) {
    return { error: `${name} must be a positive integer.` };
  }
  const normalized = normalizeDecimal(value);
  if (normalized === "0") {
    return { error: `${name} must be a positive integer.` };
  }
  if (normalized.length > String(cap).length ||
      (normalized.length === String(cap).length && normalized > String(cap))) {
    return { value: cap };
  }
  return { value: Number(normalized) };
}

function comparePositiveDecimalToInteger(decimal, integer) {
  const integerText = String(integer);
  if (decimal.length !== integerText.length) {
    return decimal.length < integerText.length ? -1 : 1;
  }
  return decimal === integerText ? 0 : decimal < integerText ? -1 : 1;
}

function handleProperties(request, response, url) {
  const limitParam = singleParameter(url, "limit");
  const perPageParam = singleParameter(url, "per_page");
  const pageParam = singleParameter(url, "page");

  for (const [name, parameter] of [
    ["limit", limitParam],
    ["per_page", perPageParam],
    ["page", pageParam],
  ]) {
    if (parameter.error) {
      sendError(request, response, 400, `invalid_${name}`, parameter.error);
      return;
    }
  }

  if (limitParam.present && (perPageParam.present || pageParam.present)) {
    sendError(
      request,
      response,
      400,
      "conflicting_pagination_parameters",
      "Use either limit or the per_page/page parameters, not both.",
    );
    return;
  }

  if (limitParam.present) {
    const parsedLimit = parsePositiveParameter(limitParam.value, "limit", MAX_LIMIT);
    if (parsedLimit.error) {
      sendError(request, response, 400, "invalid_limit", parsedLimit.error);
      return;
    }
    sendJson(request, response, 200, properties.slice(0, parsedLimit.value));
    return;
  }

  let perPage = DEFAULT_PER_PAGE;
  if (perPageParam.present) {
    const parsedPerPage = parsePositiveParameter(perPageParam.value, "per_page", MAX_PER_PAGE);
    if (parsedPerPage.error) {
      sendError(request, response, 400, "invalid_per_page", parsedPerPage.error);
      return;
    }
    perPage = parsedPerPage.value;
  }

  let pageDecimal = "1";
  if (pageParam.present) {
    if (!/^\d+$/.test(pageParam.value)) {
      sendError(request, response, 400, "invalid_page", "page must be a positive integer.");
      return;
    }
    pageDecimal = normalizeDecimal(pageParam.value);
    if (pageDecimal === "0") {
      sendError(request, response, 400, "invalid_page", "page must be a positive integer.");
      return;
    }
  }

  const totalItems = properties.length;
  const totalPages = Math.ceil(totalItems / perPage);
  const headers = {
    "X-WP-Total": String(totalItems),
    "X-WP-TotalPages": String(totalPages),
  };

  let pageProperties = [];
  if (totalPages > 0 && comparePositiveDecimalToInteger(pageDecimal, totalPages) <= 0) {
    const page = Number(pageDecimal);
    const start = (page - 1) * perPage;
    pageProperties = properties.slice(start, start + perPage);
  }

  if (failPage !== undefined && pageDecimal === failPage) {
    sendJson(request, response, 500, {
      code: "mock_page_failure",
      message: `Mock failure requested for properties page ${pageDecimal}.`,
      data: { status: 500 },
    });
    return;
  }

  sendJson(request, response, 200, pageProperties, headers);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  const propertiesPath = `${API_PREFIX}/anunturi`;
  const taxonomiesPath = `${API_PREFIX}/taxonomii`;
  const singlePropertyMatch = url.pathname.match(/^\/wp-json\/casapronto\/v1\/anunturi\/(\d+)$/);
  const knownPath =
    url.pathname === propertiesPath ||
    url.pathname === taxonomiesPath ||
    singlePropertyMatch !== null;

  if (!knownPath) {
    sendError(request, response, 404, "rest_no_route", "No mock route was found for this request.");
    console.log(`${request.method} ${url.pathname} -> 404`);
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      ...corsHeaders(request),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    });
    response.end();
    console.log(`${request.method} ${url.pathname} -> 204`);
    return;
  }

  if (request.method !== "GET") {
    sendError(request, response, 405, "rest_method_not_allowed", "Only GET and OPTIONS are supported.");
    console.log(`${request.method} ${url.pathname} -> 405`);
    return;
  }

  if (delayMs > 0) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }

  if (url.pathname === propertiesPath) {
    handleProperties(request, response, url);
    console.log(`${request.method} ${url.pathname} -> ${response.statusCode}`);
    return;
  }

  if (singlePropertyMatch) {
    const propertyId = Number(singlePropertyMatch[1]);
    const property = Number.isSafeInteger(propertyId)
      ? properties.find((item) => item.id === propertyId)
      : undefined;

    if (property) {
      sendJson(request, response, 200, property);
    } else {
      sendError(
        request,
        response,
        404,
        "no_property",
        "Proprietatea nu a fost gasita",
      );
    }

    console.log(`${request.method} ${url.pathname} -> ${response.statusCode}`);
    return;
  }

  sendJson(request, response, 200, taxonomies);
  console.log(`${request.method} ${url.pathname} -> ${response.statusCode}`);
});

server.listen(PORT, HOST, () => {
  console.log(`Local WordPress API mock listening at http://${HOST}:${PORT}${API_PREFIX}`);
  console.log(`Loaded ${properties.length} local property fixtures and local taxonomy fixtures.`);
  if (failPage !== undefined) console.log(`Failure simulation enabled for properties page ${failPage}.`);
  if (delayMs > 0) console.log(`Response delay enabled: ${delayMs} ms.`);
});

server.on("error", (error) => {
  console.error(`Local mock server failed: ${error.message}`);
  process.exitCode = 1;
});
