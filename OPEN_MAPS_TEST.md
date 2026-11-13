# HAMBA ROUTES isolated open-map test

Base: Naha1981/hamba-routes commit 7b217c99871dbc03cf6b67432ba932764f64f9d2.
No push, deployment, key rotation or live Firebase access.

## Verdict
Local map/van/stop/road-route slice: PASS on fresh desktop and 390px mobile browser contexts.
Complete real-user signup-to-cloud-saved-route journey: NOT PASSED. Existing code offers Google-only Firebase sign-in; local-test mode blocks it explicitly, uses no account and stores fictional data only in browser localStorage. This is not multi-user authentication or secure cloud storage.

## Configuration
Set MAP_PROVIDER=open on the server; VITE_MAP_PROVIDER=open and VITE_LOCAL_TEST=true for the frontend. Google remains the default when these settings are absent. Original Google map component is byte-identical. Both configurations build; no live Google request was tested.
For this isolated R0 test: PORT=4347 MAP_PROVIDER=open VITE_MAP_PROVIDER=open VITE_LOCAL_TEST=true npm run dev.
VITE_TILE_URL changes the tile source. OSRM_BASE_URL changes the road-routing service.

## New visitor path actually exercised
Empty browser-local workspace; click sign-in and see the explicit untested gate; add one van to existing one; add three fictional customers via visible forms with manually confirmed coordinates; click Plan; two actual OSRM responses provide five total road legs, 11.3km/22min drive estimates across the two vans. Reload retains three stops and fleet locally. Repeated at 390px: add and plan buttons work, no document horizontal overflow. Mobile visit-card visual layout not fully accepted; customer names are condensed/hidden by the existing responsive UI.
Typecheck and both Google/open production builds pass. No runtime page errors in the bounded desktop/mobile test.
Injected routing failure produces explicit warning and five dashed estimate legs. Invalid latitude returns HTTP400. No Google Maps or Firebase API calls made. Google Fonts request is unrelated and was blocked in the browser test.
The displayed R1,440 is fictional scheduled service value, not actual revenue or savings. On-time badges are model estimates, not field evidence.

## Honest limits and policy
No live traffic, road drive, spoken navigation, background GPS, real signup, cross-device persistence, physical vehicle setup, depot editing, global optimisation proof, financial ROI, production security or full regression acceptance. Existing simulation/weekday/savings paths need their own review. Public OSRM demo is permitted only for reasonable non-commercial tests, at most one request/second; no SLA. Requests are serialized and cached, with a timeout; production refuses the public-demo default unless an explicit routing endpoint is configured. Self-hosted software is free, hosting/data upkeep is not guaranteed R0. Coordinates go to the routing service; this test used no actual customer data.
Nominatim is deliberately NOT integrated as public autocomplete: its policy forbids autocomplete and restricts generic generated geocoding/vehicle-tracking use and private data. Manual confirmed coordinates avoid silently routing to a guessed address. A compliant owned/service geocoder remains needed for normal address onboarding.
OSM tiles carry visible attribution, standard browser caching and only current viewport requests; no offline/bulk downloads. Public tile service has no uptime guarantee. Leaflet BSD-2-Clause; OSRM BSD-2-Clause; OSM data ODbL. Source repo commercial/reuse licence not independently established.

Sources:
https://github.com/Naha1981/hamba-routes
https://leafletjs.com
https://github.com/Project-OSRM/osrm-backend
https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
https://operations.osmfoundation.org/policies/nominatim/
https://operations.osmfoundation.org/policies/tiles/
