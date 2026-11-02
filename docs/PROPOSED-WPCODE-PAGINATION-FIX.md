# Proposed WPCode pagination fix

This is a local proposal for replacing only `get_anunturi_direct($request)` in the active WPCode snippet. It has not been installed. The complete snippet supplied for review confirms the collection route, the `properties` custom post type, published-only filtering, descending date ordering, and the `format_anunt_pentru_api($post)` mapper.

Keep the existing route registration for `/anunturi`, `get_anunt_single()`, `get_toate_taxonomiile()`, the Rank Math helpers, and `format_anunt_pentru_api()` unchanged. The mapper conditionally calls `get_casapronto_optimized_gallery()` when that separately defined helper exists and otherwise builds a fallback gallery. Both paths remain in use. The proposal below depends on WordPress's existing `WP_Query`, `WP_REST_Response`, and `WP_Error` classes and the snippet's existing `format_anunt_pentru_api()` function.

## Proposed callback replacement

```php
function get_anunturi_direct($request) {
    $has_limit = $request->has_param('limit');
    $has_per_page = $request->has_param('per_page');
    $has_page = $request->has_param('page');

    if ($has_limit && ($has_per_page || $has_page)) {
        return new WP_Error(
            'conflicting_pagination_parameters',
            'Use either limit or the per_page/page parameters, not both.',
            array('status' => 400)
        );
    }

    $parse_positive_int = static function ($value, $name, $maximum = null) {
        if (!is_scalar($value) || !preg_match('/^[0-9]+$/', (string) $value)) {
            return new WP_Error(
                'invalid_' . $name,
                sprintf('%s must be a positive integer.', $name),
                array('status' => 400)
            );
        }

        $digits = ltrim((string) $value, '0');
        if ($digits === '') {
            return new WP_Error(
                'invalid_' . $name,
                sprintf('%s must be a positive integer.', $name),
                array('status' => 400)
            );
        }

        if ($maximum !== null) {
            $maximum_digits = (string) $maximum;
            if (
                strlen($digits) > strlen($maximum_digits) ||
                (strlen($digits) === strlen($maximum_digits) && strcmp($digits, $maximum_digits) > 0)
            ) {
                return $maximum;
            }
        }

        $number = filter_var($digits, FILTER_VALIDATE_INT, array(
            'options' => array('min_range' => 1),
        ));

        if ($number === false) {
            return new WP_Error(
                'invalid_' . $name,
                sprintf('%s must be a positive integer.', $name),
                array('status' => 400)
            );
        }

        return $number;
    };

    // Preserve the live callback's post type and published-property filter.
    // ID DESC is a stable tiebreaker when multiple properties share a date.
    $query_args = array(
        'post_type'           => 'properties',
        'post_status'         => 'publish',
        'orderby'             => array('date' => 'DESC', 'ID' => 'DESC'),
        'order'               => 'DESC',
        'suppress_filters'    => true,
        'ignore_sticky_posts' => true,
    );

    if ($has_limit) {
        $limit = $parse_positive_int($request->get_param('limit'), 'limit', 100);
        if (is_wp_error($limit)) {
            return $limit;
        }

        // Preserve ?limit=60 for the initial frontend render, with a 100-item cap.
        $posts = get_posts(array_merge($query_args, array(
            'posts_per_page' => $limit,
        )));

        return array_map('format_anunt_pentru_api', $posts);
    }

    // A bare request now returns a safe first page instead of all properties.
    $per_page = 10;
    if ($has_per_page) {
        $per_page = $parse_positive_int($request->get_param('per_page'), 'per_page', 200);
        if (is_wp_error($per_page)) {
            return $per_page;
        }
    }

    $page = 1;
    $page_exceeds_php_int = false;
    if ($has_page) {
        $page_param = $request->get_param('page');
        if (!is_scalar($page_param) || !preg_match('/^[0-9]+$/', (string) $page_param)) {
            return new WP_Error(
                'invalid_page',
                'page must be a positive integer.',
                array('status' => 400)
            );
        }

        $page_digits = ltrim((string) $page_param, '0');
        if ($page_digits === '') {
            return new WP_Error(
                'invalid_page',
                'page must be a positive integer.',
                array('status' => 400)
            );
        }

        $parsed_page = filter_var($page_digits, FILTER_VALIDATE_INT, array(
            'options' => array('min_range' => 1),
        ));
        if ($parsed_page === false) {
            // A positive decimal page larger than PHP_INT_MAX cannot exist in this catalog.
            $page_exceeds_php_int = true;
        } else {
            $page = $parsed_page;
        }
    }

    $run_page_query = static function ($requested_page) use ($query_args, $per_page) {
        return new WP_Query(array_merge($query_args, array(
            'posts_per_page' => $per_page,
            'paged'           => $requested_page,
            'no_found_rows'   => false,
        )));
    };

    if ($page_exceeds_php_int || $page > 1000) {
        // Avoid sending enormous offsets to WP_Query. Probe page 1 for totals first.
        $totals_query = $run_page_query(1);
        $total_items = $totals_query->found_posts;
        $total_pages = $totals_query->max_num_pages;
        $requested_posts = array();

        if (!$page_exceeds_php_int && $page <= $total_pages) {
            $requested_query = $run_page_query($page);
            $requested_posts = $requested_query->posts;
        }
    } else {
        $query = $run_page_query($page);
        $requested_posts = $query->posts;
        $total_items = $query->found_posts;
        $total_pages = $query->max_num_pages;

        if ($page > 1 && empty($requested_posts)) {
            // WP_Query may leave found_posts/max_num_pages at zero for an empty page.
            // Re-run a bounded first-page query only to retrieve the real totals.
            $totals_query = $run_page_query(1);
            $total_items = $totals_query->found_posts;
            $total_pages = $totals_query->max_num_pages;
        }
    }

    // The totals probe's posts are never formatted or returned.
    $body = array_map('format_anunt_pentru_api', $requested_posts);

    return new WP_REST_Response($body, 200, array(
        'X-WP-Total'                => (string) $total_items,
        'X-WP-TotalPages'           => (string) $total_pages,
    ));
}
```

The `limit` path keeps the current response shape: a JSON array of formatter output. `?limit=60` still returns the first 60 published properties in descending date order. The paginated path uses `WP_Query` with `posts_per_page` and `paged`, so it fetches only one page; it does not fetch all posts and slice them afterward. Both paths use the same `date DESC, ID DESC` order. The secondary ID sort only determines the order of records sharing a date.

Paginated responses return the same mapped array shape and include `X-WP-Total` and `X-WP-TotalPages`. For a non-empty requested page, the callback reads those values from that query. `WP_Query::set_found_posts()` can leave them at zero when a requested page has no posts, so an empty result for page 2 or later triggers a bounded page-1 query used only to obtain the real totals. Its posts are neither formatted nor returned. A genuinely empty catalog returns `[]`, total `0`, and total pages `0`.

For page numbers greater than 1000, or positive decimal page numbers larger than `PHP_INT_MAX`, the callback probes page 1 before attempting the requested offset. If the page number is beyond the actual page count, it returns `[]` with the probed totals without issuing a huge-offset query. If a page above 1000 is in range, it then queries that page. Invalid, zero, negative, fractional, or conflicting parameters return HTTP 400. Page sizes above 200 are capped at 200; `limit` values above 100 remain capped at 100.

## CORS and response headers

The supplied active snippet removes WordPress's `rest_send_cors_headers` filter and installs its own `rest_pre_serve_request` filter. That custom filter currently sends `Access-Control-Allow-Origin: *`, allows `GET, POST, OPTIONS`, allows the `Content-Type` request header, and does not send `Access-Control-Expose-Headers`.

The custom `/anunturi` callback currently returns a plain array and sets no pagination-total headers. Unlike WordPress's built-in posts collection controller, this custom callback must set `X-WP-Total` and `X-WP-TotalPages` itself. WordPress 7.1.3's `WP_REST_Server::serve_request()` sends the core `Access-Control-Expose-Headers` value `X-WP-Total, X-WP-TotalPages, Link` before dispatching the route callback. This core behavior is independent of the custom `rest_send_cors_headers` filter described above.

The proposed `WP_REST_Response` therefore sets only the two pagination-total headers; it does not set `Access-Control-Expose-Headers`. WordPress later sends response-object headers through `WP_REST_Server::send_header()`, which calls PHP `header()` with replacement behavior. Adding a narrower expose-header value to the response object could replace the core value and omit `Link`. The existing custom `Access-Control-Allow-Origin`, allowed methods, and allowed request headers remain unchanged; this proposal does not broaden CORS.

This repository cannot establish whether a hosting layer or other active WordPress code changes the final response headers. After deployment, test from the actual frontend origin that a browser `fetch()` can read both values using `response.headers.get('X-WP-Total')` and `response.headers.get('X-WP-TotalPages')`. Confirm the final `Access-Control-Expose-Headers` response value as well; seeing headers only in the Network panel does not prove JavaScript can read them. This browser check has not been performed.

## Compatibility

- The current callback uses `limit` when positive and otherwise sets `posts_per_page` to `-1`. A request omitting `limit`, `per_page`, and `page` therefore currently returns the whole catalog. This proposal changes a bare request to page 1 of 10. No checked-in collection caller omits all three parameters, but external integrations may rely on the old unbounded response and must paginate instead.
- The frontend's `?limit=60` request remains compatible. `limit` values above 100 are now capped; invalid or empty `limit` values return HTTP 400 rather than falling back to an unbounded query.
- A request combining `limit` with `per_page` or `page` is rejected as ambiguous. No checked-in caller sends that combination.
- The stable ID tiebreaker may reorder records that have identical publication timestamps. It makes page boundaries deterministic while retaining the existing descending-date order.
- Pagination totals and pages must be verified against the live `properties` data and any hosting or WordPress query filters. Do not install this proposal until the final browser response confirms the headers and counts.

## Manual verification checklist (not executed)

Run these against a staging or controlled WordPress environment after coordinating the PHP and frontend changes. They have not been run against WordPress as part of this local review.

- `?limit=60` returns the first 60 mapped properties, using the stable date-descending/ID-descending order.
- With more than 200 published properties, page 1 returns 200 and the correct total headers. Page 2 returns the next 200 when available. A final partial page returns only its remaining records and the same catalog totals.
- For a 4,904-property catalog, `?per_page=200&page=1` and page 2 each return 200 records; page 25 returns 104 records; page 26 returns `[]`. Every paginated response reports `X-WP-Total: 4904` and `X-WP-TotalPages: 25`.
- A page exactly one beyond `X-WP-TotalPages` returns `[]`, the actual `X-WP-Total`, and the actual `X-WP-TotalPages`. Confirm the page-1 totals probe does not leak or format its records into the response.
- A very large page such as `page=1000000000`, and a positive decimal page value larger than `PHP_INT_MAX`, returns `[]` with the actual totals without issuing a huge-offset query. A large page that is actually within the reported page count still returns that page's records.
- With no published properties, request page 1 and an out-of-range page. Both return `[]`, total `0`, and total pages `0`.
- Invalid page values, invalid/zero page sizes, conflicting `limit` and pagination parameters, and page sizes above 200 behave as documented. Values above 100 for `limit` remain capped at 100.
- After deployment, from the actual frontend origin, verify the actual site response exposes `X-WP-Total`, `X-WP-TotalPages`, and `Link`, and verify browser `fetch()` can read both pagination totals with `response.headers.get(...)`. Seeing headers in browser Network tools alone does not confirm that JavaScript can access them; this check remains unverified until run against the deployed site.
