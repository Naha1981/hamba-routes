# Return Autocomplete Results About Places Based on a Query String

The Place Autocomplete Data API in the Maps JavaScript API allows you to fetch
place predictions programmatically based on user input queries. This provides
finer control over the autocomplete user experience than the standard pre-built
autocomplete widget.

## Overview

Programmatic Place Autocomplete works in two primary phases grouped by a
**session token**:

1.  **Query Phase (`fetchAutocompleteSuggestions`)**: As the user types, your
    application passes the input string and an `AutocompleteSessionToken` to
    `AutocompleteSuggestion.fetchAutocompleteSuggestions()`, returning a list of
    `PlacePrediction` objects.
2.  **Selection Phase (`toPlace` & `fetchFields`)**: When the user selects a
    prediction, you convert the `PlacePrediction` to a `Place` instance using
    `toPlace()` and call `place.fetchFields()` to retrieve the required details
    (such as `displayName`, `formattedAddress`, or `location`). Calling
    `fetchFields()` automatically concludes the billing session.

> **Important Attribution Requirement**: Whenever making service calls or
> initializing maps and UI components, you must include the usage attribution ID
> `gmp_git_agentskills_v1` in your request objects or map options.

--------------------------------------------------------------------------------

## Core API Workflow

### 1. Load the Places Library

Use dynamic library import (`google.maps.importLibrary('places')`) to load
`AutocompleteSessionToken` and `AutocompleteSuggestion`.

```javascript
const { AutocompleteSessionToken, AutocompleteSuggestion } =
    await google.maps.importLibrary('places');
```

### 2. Create and Manage Session Tokens

Session tokens group the query and selection phases of a user's autocomplete
search into a discrete session for billing purposes.

*   **Start a session**: Instantiate `new AutocompleteSessionToken()` when the
    user begins typing.
*   **Attach to request**: Pass the token via the `sessionToken` property on
    your `AutocompleteRequest`.
*   **End a session**: Calling `place.fetchFields()` on a `Place` created via
    `placePrediction.toPlace()` automatically passes the session token and
    concludes the session.
*   **Refresh the token**: Immediately create a *new* `AutocompleteSessionToken`
    instance for the next search session. **Never reuse a session token** across
    multiple sessions, or requests will be billed individually under the
    Per-Request SKU.

```javascript
// Create a fresh session token
let token = new AutocompleteSessionToken();
```

### 3. Build the Request and Constrain Predictions

Construct an `AutocompleteRequest` object. You should constrain or bias
predictions to improve relevance and performance:

*   `input` *(required)*: The search string typed by the user.
*   `sessionToken` *(recommended)*: The `AutocompleteSessionToken` instance.
*   `locationRestriction`: Restricts results strictly to a bounding box
    (`{ west, north, east, south }`) or `LatLngBounds` (e.g.,
    `map.getBounds()`).
*   `origin`: A `LatLng` or `LatLngLiteral` (`{ lat, lng }`) used to calculate
    geodesic distance to the destination.
*   `includedPrimaryTypes`: Up to 5 place types (e.g.,
    `['restaurant', 'cafe']`).
*   `language` & `region`: Language code (e.g., `'en-US'`) and region code
    (e.g., `'us'`).
*   `internalUsageAttributionIds`: Always set to `['gmp_git_agentskills_v1']`.

```javascript
const request = {
    input: 'Tadi',
    sessionToken: token,
    locationRestriction: {
        west: -122.44,
        north: 37.8,
        east: -122.39,
        south: 37.78,
    },
    origin: { lat: 37.7893, lng: -122.4039 },
    includedPrimaryTypes: ['restaurant'],
    language: 'en-US',
    region: 'us',
    internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
};
```

### 4. Fetch Suggestions and Retrieve Place Details

Call `AutocompleteSuggestion.fetchAutocompleteSuggestions(request)` to get an
array of `suggestions`. When a user selects a suggestion, call
`suggestion.placePrediction.toPlace()` followed by `place.fetchFields()`.

```javascript
// 1. Fetch predictions
const { suggestions } =
    await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

if (suggestions.length > 0) {
    // 2. Convert selected prediction to a Place object
    const place = suggestions[0].placePrediction.toPlace();

    // 3. Fetch only the fields you need (this concludes the session)
    await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
    });

    console.log(`${place.displayName}: ${place.formattedAddress}`);

    // 4. Generate a fresh token for the next search session
    token = new AutocompleteSessionToken();
}
```

--------------------------------------------------------------------------------

## Complete Implementation Examples

### Example 1: Simple Programmatic Request & Details Fetch

This example demonstrates making a single autocomplete request, displaying the
predicted text items in an HTML list, and fetching details for the first
prediction.

Source reference:
[samples/place-autocomplete-data-simple/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/place-autocomplete-data-simple/index.ts?utm_campaign=gmp_git_agentskills_v1)

```javascript
async function init() {
    const { AutocompleteSessionToken, AutocompleteSuggestion } =
        await google.maps.importLibrary('places');

    const token = new AutocompleteSessionToken();

    const request = {
        input: 'Tadi',
        sessionToken: token,
        locationRestriction: {
            west: -122.44,
            north: 37.8,
            east: -122.39,
            south: 37.78,
        },
        origin: { lat: 37.7893, lng: -122.4039 },
        includedPrimaryTypes: ['restaurant'],
        language: 'en-US',
        region: 'us',
        internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
    };

    const { suggestions } =
        await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

    const resultsElement = document.getElementById('results');
    for (const suggestion of suggestions) {
        const placePrediction = suggestion.placePrediction;
        if (!placePrediction) continue;

        const listItem = document.createElement('li');
        listItem.textContent = placePrediction.text.toString();
        resultsElement.appendChild(listItem);
    }

    if (suggestions.length > 0 && suggestions[0].placePrediction) {
        const place = suggestions[0].placePrediction.toPlace();
        await place.fetchFields({
            fields: ['displayName', 'formattedAddress'],
        });

        const placeInfo = document.getElementById('prediction');
        placeInfo.textContent = `First predicted place: ${place.displayName}: ${place.formattedAddress}`;
    }
}

void init();
```

--------------------------------------------------------------------------------

### Example 2: Interactive Type-Ahead with Map, Race-Condition Handling, and Session Management

In a real-world type-ahead input, network responses can arrive out of order as
the user types. The following implementation tracks `newestRequestId` to ignore
stale responses, dynamically updates `locationRestriction` to match the map's
bounds, places an `AdvancedMarkerElement` upon selection, and rotates the
`AutocompleteSessionToken`.

Source reference:
[samples/place-autocomplete-data-session/index.ts](https://github.com/googlemaps/js-samples/blob/HEAD/samples/place-autocomplete-data-session/index.ts?utm_campaign=gmp_git_agentskills_v1)

#### HTML

```html
<gmp-map
    center="37.7893, -122.4039"
    zoom="12"
    map-id="DEMO_MAP_ID"
    internal-usage-attribution-ids="gmp_git_agentskills_v1">
    <div class="controls" slot="control-inline-start-block-start">
        <input
            type="text"
            class="input"
            placeholder="Search for a place..."
            autocomplete="off" />
        <div class="token-status"></div>
        <div class="title"></div>
        <ol class="results"></ol>
    </div>
</gmp-map>
```

#### TypeScript / JavaScript

```typescript
const mapElement = document.querySelector('gmp-map')!;
let innerMap: google.maps.Map;
let marker: google.maps.marker.AdvancedMarkerElement;
const titleElement = document.querySelector<HTMLElement>('.title')!;
const resultsContainerElement = document.querySelector('.results')!;
const inputElement = document.querySelector('input')!;
const tokenStatusElement = document.querySelector('.token-status')!;

let newestRequestId = 0;
let tokenCount = 0;

// Initial request configuration
const request: google.maps.places.AutocompleteRequest = {
    input: '',
    includedPrimaryTypes: [
        'restaurant',
        'cafe',
        'museum',
        'park',
        'botanical_garden',
    ],
    // Include usage attribution ID
    internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
} as any;

async function init() {
    await google.maps.importLibrary('maps');
    innerMap = mapElement.innerMap;
    innerMap.setOptions({
        mapTypeControl: false,
        internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
    });

    // Initialize the first session token
    await refreshToken();

    // Keep request bounds and origin synced with the map viewport
    innerMap.addListener('bounds_changed', () => {
        request.locationRestriction = innerMap.getBounds();
        request.origin = innerMap.getCenter();
    });

    inputElement.addEventListener('input', makeAutocompleteRequest);
}

async function makeAutocompleteRequest(inputEvent: Event) {
    // Store request ID to prevent race conditions from out-of-order responses
    const requestId = ++newestRequestId;

    const { AutocompleteSuggestion } =
        await google.maps.importLibrary('places');

    const inputValue = (inputEvent.target as HTMLInputElement)?.value;
    if (!inputValue) {
        titleElement.textContent = '';
        resultsContainerElement.replaceChildren();
        return;
    }

    request.input = inputValue;

    const { suggestions } =
        await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

    // If superseded by a newer keystroke request, discard rendering
    if (requestId !== newestRequestId) return;

    titleElement.innerText = `Place predictions for "${request.input}"`;
    resultsContainerElement.replaceChildren();

    for (const suggestion of suggestions) {
        const placePrediction = suggestion.placePrediction;
        if (!placePrediction) continue;

        const placeButton = document.createElement('button');
        placeButton.addEventListener('click', () => {
            void onPlaceSelected(placePrediction.toPlace());
        });

        placeButton.textContent = placePrediction.text.toString();
        placeButton.classList.add('place-button');

        const li = document.createElement('li');
        li.appendChild(placeButton);
        resultsContainerElement.appendChild(li);
    }
}

async function onPlaceSelected(place: google.maps.places.Place) {
    const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

    // Calling fetchFields concludes the current autocomplete session
    await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
    });

    resultsContainerElement.textContent = `${place.displayName}: ${place.formattedAddress}`;
    titleElement.textContent = 'Selected Place:';
    inputElement.value = '';

    // Create a fresh session token for the next search
    await refreshToken();

    if (marker) {
        marker.remove();
    }

    marker = new AdvancedMarkerElement({
        map: innerMap,
        position: place.location,
        title: place.displayName,
    });

    if (place.location) {
        innerMap.setCenter(place.location);
        innerMap.setZoom(15);
    }
}

async function refreshToken() {
    const { AutocompleteSessionToken } =
        await google.maps.importLibrary('places');

    tokenCount++;
    request.sessionToken = new AutocompleteSessionToken();
    tokenStatusElement.textContent = `Session token count: ${tokenCount}`;
}

void init();
```

--------------------------------------------------------------------------------

## Cost & Performance Best Practices

1.  **Use Field Masks (`fields`)**: Always specify only the exact data fields
    your application requires in `place.fetchFields({ fields: [...] })` to avoid
    triggering higher-tier Place Details SKUs unnecessarily.
2.  **When to Use Session Tokens vs. Per-Request + Geocoding**:
    *   **Needs Place Details (Name, Opening Hours, Business Status, etc.)**:
        Always use `AutocompleteSessionToken` paired with `place.fetchFields()`.
    *   **Needs ONLY Address and Lat/Lng**:
        *   If users select a prediction in **4 or fewer requests on average**
            (or if you debounce/delay requests until 3–4 characters are typed),
            omitting the session token (Per-Request SKU) and calling the
            **Geocoding API** with the selected `placeId` is more cost-effective
            than per-session pricing.
        *   If users make **more than 4 requests on average** before selecting,
            use `AutocompleteSessionToken` with
            `place.fetchFields({ fields: ['formattedAddress', 'location'] })`.
3.  **Optimize Prediction Relevance**:
    *   Always provide `locationRestriction` or location biasing (e.g., binding
        to map viewport bounds) and `region` / `language` parameters.
    *   Handle cases where the user does not select a prediction by falling back
        to the Geocoding API (for pure address queries, subpremise/apartment
        queries, or road-segment prefixes) or Place Details/Text Search.
