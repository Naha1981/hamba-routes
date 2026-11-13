# Return distances for a matrix of routes between multiple origins and destinations

Use the Routes API `computeRouteMatrix` method (REST) or streaming
`ComputeRouteMatrix` method (gRPC) to calculate the distance and duration of
routes between multiple origins and destinations. Given a list of origins and
destinations, the API calculates a route starting at each origin and ending at
each destination.

## Endpoint

**REST:**

```http
POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix
```

## Request Headers

When making a REST request, you must include the following headers:

Header                    | Value / Description
:------------------------ | :------------------
`Content-Type`            | `application/json`
`X-Goog-Api-Key`          | Your Google Maps Platform API key.
`X-Goog-FieldMask`        | Comma-separated list of fields to return (e.g., `originIndex,destinationIndex,duration,distanceMeters,status,condition`).
`X-Goog-Maps-Solution-ID` | `gmp_git_agentskills_v1` (Required for usage attribution).

## Request Limits

The number of elements in a route matrix is the number of origins *multiplied
by* the number of destinations (e.g., 10 origins × 10 destinations = 100
elements). The API enforces the following limits:

*   **General routes (non-`TRANSIT`):** Maximum of **625 elements**.
*   **`TRANSIT` routes:** Maximum of **100 elements**.
*   **`TRAFFIC_AWARE_OPTIMAL` routing preference:** Maximum of **100 elements**.
*   **Addresses or Place IDs:** You can specify up to **50 total** waypoints
    (combined origins and destinations) using addresses or Place IDs.

## Request Example (REST)

The following example calculates a route matrix for two origins and two
destinations (resulting in four total routes). It specifies the `DRIVE` travel
mode, `TRAFFIC_AWARE` routing preference, and avoids ferries for the origins.

```bash
curl -X POST -d '{
  "origins": [
    {
      "waypoint": {
        "location": {
          "latLng": {
            "latitude": 37.420761,
            "longitude": -122.081356
          }
        }
      },
      "routeModifiers": { "avoid_ferries": true }
    },
    {
      "waypoint": {
        "location": {
          "latLng": {
            "latitude": 37.403184,
            "longitude": -122.097371
          }
        }
      },
      "routeModifiers": { "avoid_ferries": true }
    }
  ],
  "destinations": [
    {
      "waypoint": {
        "location": {
          "latLng": {
            "latitude": 37.420999,
            "longitude": -122.086894
          }
        }
      }
    },
    {
      "waypoint": {
        "location": {
          "latLng": {
            "latitude": 37.383047,
            "longitude": -122.044651
          }
        }
      }
    }
  ],
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_AWARE"
}' \
-H 'Content-Type: application/json' \
-H 'X-Goog-Api-Key: YOUR_API_KEY' \
-H 'X-Goog-FieldMask: originIndex,destinationIndex,duration,distanceMeters,status,condition' \
-H 'X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1' \
'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
```

## Understanding the Response

### Mapping Origins and Destinations

Response elements are not guaranteed to be returned in any specific order
(especially when using gRPC streaming). You must store the order of your
request's `origins` and `destinations` arrays and use the zero-based
`originIndex` and `destinationIndex` fields in the response to map each route
back to its corresponding origin (`origins[originIndex]`) and destination
(`destinations[destinationIndex]`).

### Example Response Body

```json
[
  {
    "originIndex": 0,
    "destinationIndex": 0,
    "status": {},
    "distanceMeters": 822,
    "duration": "160s",
    "condition": "ROUTE_EXISTS"
  },
  {
    "originIndex": 1,
    "destinationIndex": 0,
    "status": {},
    "distanceMeters": 2919,
    "duration": "361s",
    "condition": "ROUTE_EXISTS"
  },
  {
    "originIndex": 1,
    "destinationIndex": 1,
    "status": {},
    "distanceMeters": 5598,
    "duration": "402s",
    "condition": "ROUTE_EXISTS"
  },
  {
    "originIndex": 0,
    "destinationIndex": 1,
    "status": {},
    "distanceMeters": 7259,
    "duration": "712s",
    "condition": "ROUTE_EXISTS"
  }
]
```

### Handling Errors and Conditions

*   **Request-level errors:** If the entire request is malformed (e.g., zero
    origins provided), the API returns a standard HTTP/gRPC error for the whole
    response.
*   **Element-level errors:** If a failure only affects a specific
    origin-destination pair (e.g., a route cannot be computed between two
    specific points), the overall request succeeds, and only the affected
    element will contain an error code inside its `status` field or indicate the
    issue via the `condition` field.

### REST vs. gRPC Streaming

*   **gRPC (`ComputeRouteMatrix`):** Returns a stream of route elements,
    allowing you to process results immediately as each combination is
    calculated without waiting for the entire matrix to finish.
*   **REST (`computeRouteMatrix`):** Does not support streaming; returns the
    complete array of elements once calculated.
