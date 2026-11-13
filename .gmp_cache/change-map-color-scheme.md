# Change the map color scheme

You can change the color scheme and visual styling of a Google map using the
Maps JavaScript API. Before modifying the map appearance, ensure you have
completed the prerequisite of adding a customizable, interactive map to your web
page or app.

## Overview

The Maps JavaScript API supports multiple ways to change a map's color scheme
and visual presentation:

1.  **Built-in Color Scheme (`colorScheme`)**: Set the map's color scheme to
    light, dark, or follow the user's system preferences (`ColorScheme.LIGHT`,
    `ColorScheme.DARK`, or `ColorScheme.FOLLOW_SYSTEM`) at map initialization
    time.
2.  **Cloud-based Map Styling (`mapId`)**: Associate a Map ID with custom light
    or dark styles configured in the Google Cloud Console.
3.  **JSON Styling (`styles`)**: Pass a `google.maps.MapTypeStyle[]` array in
    `MapOptions` or via `map.setOptions({ styles: [...] })` to customize colors
    and visibility of map features (such as water, roads, landscapes, and
    labels).

--------------------------------------------------------------------------------

## 1. Set the built-in map color scheme at initialization

You can set the `colorScheme` option in `MapOptions` when initializing a map.
Note that `colorScheme` can only be configured when the map is initialized;
setting this option after the map is created will have no effect.

### JavaScript / TypeScript (`div` element)

```typescript
let map: google.maps.Map;

async function init(): Promise<void> {
  // Import the needed libraries
  const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary;
  const { ColorScheme } = await google.maps.importLibrary('core') as google.maps.CoreLibrary;

  // Create a new map with the DARK color scheme
  map = new Map(document.getElementById('map') as HTMLElement, {
    center: { lat: -34.397, lng: 150.644 },
    zoom: 8,
    colorScheme: ColorScheme.DARK, // Options: LIGHT, DARK, FOLLOW_SYSTEM
    internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
  });
}

void init();
```

### Web Component (`gmp-map` element)

When using the `<gmp-map>` web component, access the `innerMap` or configure
properties on the element:

```html
<gmp-map
  center="-34.397,150.644"
  zoom="8"
  map-id="DEMO_MAP_ID"
  internal-usage-attribution-ids="gmp_git_agentskills_v1">
</gmp-map>
```

--------------------------------------------------------------------------------

## 2. Change map styles using Cloud-based Map IDs (`mapId`)

You can define custom color schemes (including distinct Light and Dark mode
styles) in the Google Cloud Console and apply them by specifying a `mapId` when
instantiating the map.

> **Important:** Due to how the Maps JavaScript API works, a new
> `google.maps.Map` instance must be created when changing the `mapId`
> dynamically, which affects the number of billed map loads.

### Sample Code: Cloud-based Map ID Styling

Source:
https://github.com/googlemaps/js-samples/blob/HEAD/samples/map-id-style/index.ts?utm_campaign=gmp_git_agentskills_v1

```typescript
async function initMap(): Promise<void> {
  const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;

  new Map(
    document.getElementById("map") as HTMLElement,
    {
      mapId: "8e0a97af9386fef", // Replace with your styled Map ID
      center: { lat: 48.85, lng: 2.35 },
      zoom: 12,
      internalUsageAttributionIds: ["gmp_git_agentskills_v1"],
    } as google.maps.MapOptions
  );
}

void initMap();
```

--------------------------------------------------------------------------------

## 3. Change map colors dynamically with JSON `styles`

For raster maps or local style overrides without recreating the map instance,
you can provide an array of `google.maps.MapTypeStyle` objects either at
initialization time or dynamically using `map.setOptions({ styles: [...] })`.

### Dynamic JSON Styling (`div` or `gmp-map`)

```typescript
let map: google.maps.Map;

const darkCustomStyle: google.maps.MapTypeStyle[] = [
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#004358' }],
  },
  {
    featureType: 'landscape',
    elementType: 'geometry',
    stylers: [{ color: '#1f8a70' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#1f8a70' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#fd7400' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'geometry',
    stylers: [{ color: '#1f8a70' }, { lightness: -20 }],
  },
  {
    featureType: 'road.local',
    elementType: 'geometry',
    stylers: [{ color: '#1f8a70' }, { lightness: -17 }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#ffffff' }, { visibility: 'on' }, { weight: 0.9 }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ visibility: 'on' }, { color: '#ffffff' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{ visibility: 'simplified' }],
  },
  {
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
];

async function init(): Promise<void> {
  const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary;

  map = new Map(document.getElementById('map') as HTMLElement, {
    center: { lat: -34.397, lng: 150.644 },
    zoom: 8,
    styles: darkCustomStyle,
    internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
  });
}

// Dynamically update the color scheme after initialization:
function clearCustomStyles(): void {
  map.setOptions({ styles: [] });
}

void init();
```

If you are using a `<gmp-map>` element, apply `setOptions` on
`mapElement.innerMap`:

```typescript
const mapElement = document.querySelector('gmp-map') as google.maps.MapElement;
mapElement.innerMap.setOptions({
  styles: darkCustomStyle,
});
```

--------------------------------------------------------------------------------

## 4. React Integration (`@vis.gl/react-google-maps`)

In React applications using `@vis.gl/react-google-maps`, you can switch between
light/dark `mapId` configurations, `colorScheme` props, or local `styles` arrays
on the `<Map>` component.

### Sample Code: Switching Map Color Schemes and Styles in React

Source:
https://github.com/visgl/react-google-maps/blob/HEAD/examples/change-map-styles/src/app.tsx?utm_campaign=gmp_git_agentskills_v1

```tsx
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { APIProvider, Map } from '@vis.gl/react-google-maps';

export type MapConfig = {
  id: string;
  label: string;
  mapId?: string;
  mapTypeId?: string;
  styles?: google.maps.MapTypeStyle[];
};

const MAP_CONFIGS: MapConfig[] = [
  {
    id: 'light',
    label: 'Light (Cloud Map ID)',
    mapId: '49ae42fed52588c3',
    mapTypeId: 'roadmap',
  },
  {
    id: 'dark',
    label: 'Dark (Cloud Map ID)',
    mapId: '739af084373f96fe',
    mapTypeId: 'roadmap',
  },
];

const API_KEY =
  globalThis.GOOGLE_MAPS_API_KEY ?? (process.env.GOOGLE_MAPS_API_KEY as string);

const App = () => {
  const [mapConfig, setMapConfig] = useState<MapConfig>(MAP_CONFIGS[0]);

  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        defaultCenter={{ lat: 22, lng: 0 }}
        defaultZoom={3}
        mapId={mapConfig.mapId || null}
        mapTypeId={mapConfig.mapTypeId}
        styles={mapConfig.styles}
        gestureHandling={'greedy'}
        disableDefaultUI={true}
        internalUsageAttributionIds={['gmp_git_agentskills_v1']}
      />

      <div className="control-panel">
        <label htmlFor="style-select">Map Color Scheme: </label>
        <select
          id="style-select"
          value={mapConfig.id}
          onChange={ev =>
            setMapConfig(MAP_CONFIGS.find(s => s.id === ev.target.value)!)
          }>
          {MAP_CONFIGS.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </APIProvider>
  );
};

export default App;
```
