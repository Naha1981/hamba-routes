# Return Travel Times for a Matrix of Routes

Use the Routes API `computeRouteMatrix` method (REST) or streaming
`ComputeRouteMatrix` method (gRPC) to calculate the distance and duration of
routes between multiple origins and destinations. Given a list of origins and
destinations, the method calculates a route starting at each origin and ending
at each destination.

## Request Limits

When constructing a route matrix request, adhere to the following limits. Note
that **elements** refers to the number of origins multiplied by the number of
destinations (e.g., 10 origins × 10 destinations = 100 elements):

*   **General routes (non-TRANSIT):** Maximum of **625 elements**.
*   **`TRANSIT` routes:** Maximum of **100 elements**.
*   **`TRAFFIC_AWARE_OPTIMAL` routing preference:** Maximum of **100 elements**.
*   **Address or Place ID waypoints:** Maximum of **50 total** origins and
    destinations combined when specified via address strings or Place IDs.

## Implementation Workflow

### 1. Construct the HTTP Request

Send a `POST` request to the `computeRouteMatrix` endpoint:

```
https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix
```

#### Required Headers

*   `Content-Type: application/json`
*   `X-Goog-Api-Key: YOUR_API_KEY`
*   `X-Goog-FieldMask`: A comma-separated list of fields to return for each
    route element (e.g.,
    `originIndex,destinationIndex,duration,distanceMeters,status,condition`).
*   `X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1`

#### Request Body Structure

*   `origins`: An array of origin objects, each containing a `waypoint` and
    optional `routeModifiers` (such as `avoid_ferries`).
*   `destinations`: An array of destination objects, each containing a
    `waypoint`.
*   `travelMode`: The mode of transport (e.g., `DRIVE`, `TRANSIT`, `WALK`,
    `BICYCLE`, `TWO_WHEELER`).
*   `routingPreference`: Traffic configuration (e.g., `TRAFFIC_AWARE`,
    `TRAFFIC_AWARE_OPTIMAL`, `TRAFFIC_UNAWARE`).

### 2. Example Request (cURL)

The following example specifies two origins and two destinations (resulting in 4
route elements), avoids ferries for the origins, and requests `originIndex`,
`destinationIndex`, `duration`, `distanceMeters`, `status`, and `condition` in
the response.

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
      "routeModifiers": { "avoid_ferries": true}
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
      "routeModifiers": { "avoid_ferries": true}
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

### 3. Parse the Response and Handle Errors

#### Matching Origins and Destinations

Response elements are **not guaranteed to be returned in any specific order**
(especially when using gRPC streaming, though REST returns an array of elements
that must also be mapped by index).

Always maintain the zero-indexed order of the `origins` and `destinations`
arrays sent in your request, and match each returned element using `originIndex`
(or `origin_index` in gRPC) and `destinationIndex` (or `destination_index` in
gRPC):

*   Route origin = `origins[originIndex]`
*   Route destination = `destinations[destinationIndex]`

#### Example Response

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

#### Error Handling

Errors can occur at two levels:

1.  **Top-Level Request Errors:** If the request itself is malformed (for
    example, it contains zero origins or an invalid API key), the entire
    response fails and returns an error.
2.  **Element-Level Errors:** If an error applies only to a specific
    origin-destination pair (for example, a route cannot be computed between one
    specific combination), the request succeeds and only the affected elements
    return an error code in their `status` field alongside the `condition`
    field.

### Notes on gRPC vs. REST

*   **gRPC (`ComputeRouteMatrix`):** Returns a stream of route elements,
    allowing you to process individual origin-destination combinations as soon
    as they are calculated without waiting for the entire matrix to complete.
*   **REST (`computeRouteMatrix`):** Does not support streaming results; it
    returns the full array of calculated elements in the HTTP response body.
