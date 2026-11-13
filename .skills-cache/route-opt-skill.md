---
name: route-optimization-api-web-api
description: Use this skill to solve complex Vehicle Routing Problems (VRP) by optimizing multi-stop delivery plans. It computes efficient routes considering dynamic constraints like time windows, vehicle capacities, costs, real-time traffic, and specialized objectives, returning detailed itineraries, costs, and navigation tokens. Authentication requires Application Default Credentials (ADC).
license: Apache-2.0
metadata:
  version: 1.0.54
---

> [!IMPORTANT]
>
> **Core Dependency:** This skill requires active context from
> [google-maps-platform/SKILL.md](https://www.gstatic.com/googlemapsplatform-agent-skills/google-maps-platform/SKILL.md).

### Overview

The Route Optimization API allows developers to efficiently solve large-scale
Vehicle Routing Problems (VRP) for logistics and fleet management. This skill
provides the resources necessary to formulate and execute optimization requests
that consider various real-world logistics constraints.

It handles complex inputs defining shipments (locations, demands, time
constraints), vehicles (capacity, operating times, costs), and optimization
parameters (traffic, objectives, constraints). The API returns an optimized
multi-vehicle, multi-stop plan detailing the stop sequences, precise start/end
times, travel durations, vehicle load changes, cost breakdowns, and navigational
data (polylines and tokens).

Authentication for the Route Optimization API requires OAuth or Application
Default Credentials (ADC).

### Mandatory settings

For the Route Optimization API (a REST API), you must include the usage
attribution ID in the HTTP header of your request to the `optimizeTours`
endpoint.

#### HTTP Header (REST API POST Requests)

```http
X-Goog-Maps-Solution-ID: gmp_git_agentskills_v1
```

## 🚀 Master Orchestration Integration Workflow

Follow this multi-phase sequential integration checklist to compose features
robustly. For each phase, read the referenced capability sub-workflow file and
satisfy its *Evidence Checkpoint* before advancing.

### 📦 Phase 1: Core Initialization & Base Setup (Primary)

-   [ ] **Step 1.1: Generates an optimized route plan considering all specified
    constraints (vehicles, shipments, costs).** Read
    [references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md).
    *Trigger Condition*: When the user requests a complete optimized route
    solution for a multi-stop delivery problem. *Evidence Checkpoint*: A
    successful HTTP 200 OK response containing the optimized `routes` array and
    overall solution metrics.

### 📦 Phase 2: Feature Layer & Custom Enrichment (Supplemental)

#### 🗺️ Feature Module: Route optimization (Optional - Use-Case Dependent)

-   [ ] **Provides the arrival and departure timestamps for every stop in the
    calculated route.** Read
    [references/return-start-and-end-times-for-each-stop-optimized-delivery.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/return-start-and-end-times-for-each-stop-optimized-delivery.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When the user needs detailed timing information for
    each waypoint on the optimized delivery plan. *Evidence Checkpoint*: Verify
    the response includes the `startTime` and `endTime` fields for each stop
    object within the route plan.
-   [ ] **Calculates the detailed temporal breakdown (travel time, wait time,
    break duration) between route stops.** Read
    [references/return-the-travel-delay-break-and-wait-durations-between-each.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/return-the-travel-delay-break-and-wait-durations-between-each.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When the user requires granular details about the time
    elapsed between stops, including non-travel activities. *Evidence
    Checkpoint*: Check the route response for detailed duration fields like
    `travelDuration`, `delayDuration`, or similar breakdown structures.
-   [ ] **Reports the remaining or required load capacity for the vehicle at
    every stop location.** Read
    [references/return-vehicle-load-information-each-stop-optimized-delivery-plan.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/return-vehicle-load-information-each-stop-optimized-delivery-plan.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When the user needs to track the vehicle's capacity
    utilization throughout the delivery route. *Evidence Checkpoint*: Confirm
    the route response includes the `loadDemands` structure showing the vehicle
    load after servicing a stop.
-   [ ] **Displays the calculated operational costs attributed to processing
    each specific shipment.** Read
    [references/return-cost-information-for-each-shipment-optimized-delivery-plan.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/return-cost-information-for-each-shipment-optimized-delivery-plan.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When the user needs to analyze the cost breakdown per
    shipment processed in the optimization. *Evidence Checkpoint*: Ensure the
    response contains `shipmentMetrics` or similar structures detailing cost
    metrics per shipment ID.
-   [ ] **Provides a compact, encoded string representing the geographical path
    between sequential stops.** Read
    [references/return-encoded-polyline-for-the-route-between-each-stop-optimized.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/return-encoded-polyline-for-the-route-between-each-stop-optimized.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When the user requires a visual representation of the
    calculated route segment for mapping purposes. *Evidence Checkpoint*: Verify
    the presence of an `encodedPolyline` string within the details of the route
    segment response.
-   [ ] **Generates a token used to retrieve turn-by-turn navigation data for
    the route segments.** Read
    [references/return-navigation-route-token-for-the-route-between-each-stop.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/return-navigation-route-token-for-the-route-between-each-stop.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When the user intends to use the optimized route
    segments for live turn-by-turn guidance via navigation APIs. *Evidence
    Checkpoint*: Confirm the response includes a `navigationRouteToken`
    associated with the generated route segments.
-   [ ] **Calculates summary statistics covering total shipments, vehicle
    utilization, and overall plan costs.** Read
    [references/return-aggregate-shipment-vehicle-and-cost-metrics-for-optimized-delivery.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/return-aggregate-shipment-vehicle-and-cost-metrics-for-optimized-delivery.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When the user needs a high-level overview of the
    optimization results and total plan efficiency. *Evidence Checkpoint*: Check
    for the presence of the `metrics` object in the response body, containing
    totals for shipments, vehicles, and costs.
-   [ ] **Defines the absolute time frame within which the entire optimization
    process must occur.** Read
    [references/specify-the-start-and-end-time-window-for-multi-stop-delivery.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/specify-the-start-and-end-time-window-for-multi-stop-delivery.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When defining global time constraints for the
    optimization run, such as operating hours. *Evidence Checkpoint*: The
    optimization result adheres strictly to the provided `globalDuration` or
    time window inputs.
-   [ ] **Sets the depot locations and time windows (e.g., shifts) during which
    each vehicle is available.** Read
    [references/specify-start-and-end-time-availability-and-locations-for-each.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/specify-start-and-end-time-availability-and-locations-for-each.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When modeling vehicle availability, including their
    starting location/time and ending location/time. *Evidence Checkpoint*: The
    optimized routes start and end at the specified vehicle locations and
    respect the defined time constraints.
-   [ ] **Defines the operational costs associated with vehicle usage over time
    (e.g., hourly rates).** Read
    [references/specify-vehicle-time-costs-for-each-vehicle-multi-stop-delivery-plan.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/specify-vehicle-time-costs-for-each-vehicle-multi-stop-delivery-plan.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When introducing time-dependent operational costs into
    the optimization objective function. *Evidence Checkpoint*: The optimization
    result minimizes the total calculated vehicle time costs based on the
    specified rates.
-   [ ] **Configures global parameters that influence how various costs (e.g.,
    penalties, delays) are calculated and weighed.** Read
    [references/specify-cost-model-parameters-for-multi-stop-delivery-plan.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/specify-cost-model-parameters-for-multi-stop-delivery-plan.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When fine-tuning the optimization objective by
    adjusting the relative importance of different cost factors. *Evidence
    Checkpoint*: The resulting route reflects cost choices, such as prioritizing
    minimizing distance over minimizing fleet size, based on model parameters.
-   [ ] **Imposes specific time window restrictions for when each individual
    shipment must be picked up and delivered.** Read
    [references/specify-pickup-and-delivery-time-constraints-for-each-shipment-multi-stop.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/specify-pickup-and-delivery-time-constraints-for-each-shipment-multi-stop.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When shipments have strict deadlines or time windows
    that must be respected during routing. *Evidence Checkpoint*: The resulting
    route itinerary confirms all pickup and delivery stops fall within their
    respective specified time windows.
-   [ ] **Pre-assigns certain shipments or stops to specific vehicles,
    constraining the optimizer's choices.** Read
    [references/specify-vehicle-assignments-for-multi-stop-delivery-plan.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/specify-vehicle-assignments-for-multi-stop-delivery-plan.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When requiring manual intervention to enforce specific
    vehicle assignments prior to optimization. *Evidence Checkpoint*: The
    resulting routes show that the specified shipments are handled only by the
    pre-assigned vehicles.
-   [ ] **Defines the maximum cargo capacity for each dimension (e.g., weight,
    volume) for the vehicles used.** Read
    [references/specify-load-limits-for-each-vehicle-multi-stop-delivery-plan.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/specify-load-limits-for-each-vehicle-multi-stop-delivery-plan.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When accounting for physical vehicle capacity
    constraints during the routing process. *Evidence Checkpoint*: The
    calculated load at any point in the route never exceeds the specified
    maximum load limits for the vehicle.
-   [ ] **Toggles the use of real-time traffic data (instead of historical) for
    calculating travel times.** Read
    [references/specify-whether-consider-live-traffic-information-for-multi-stop-delivery-plan.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/specify-whether-consider-live-traffic-information-for-multi-stop-delivery-plan.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When routing decisions need to reflect current road
    conditions to ensure accuracy. *Evidence Checkpoint*: The travel durations
    in the response match expected times based on live traffic lookups
    configured for the optimization request.
-   [ ] **Submits a long-running optimization job asynchronously and stores the
    output directly in GCS.** Read
    [references/batch-process-multi-stop-delivery-plan-optimization-request-and-write-the.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/batch-process-multi-stop-delivery-plan-optimization-request-and-write-the.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When dealing with extremely large routing problems that
    require extended computation time and asynchronous processing. *Evidence
    Checkpoint*: A successful long-running operation (LRO) completes, and the
    optimized route results JSON is located in the specified Google Cloud
    Storage bucket.
-   [ ] **Accounts for a fixed or calculated duration required for parking
    maneuvers at delivery locations.** Read
    [references/reserve-time-for-parking-before-making-deliveries.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/reserve-time-for-parking-before-making-deliveries.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When the user needs to include time allowance for
    parking preparation at stops. *Evidence Checkpoint*: The time elapsed at
    delivery stops includes the specified parking duration before service time
    begins.
-   [ ] **Uses clustering rules to ensure geographically proximate delivery
    locations are visited sequentially.** Read
    [references/prioritize-nearby-visits-made-back-back.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/prioritize-nearby-visits-made-back-back.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When grouping stops geographically is a desirable
    optimization goal (e.g., minimizing drive time variance). *Evidence
    Checkpoint*: The resulting route shows sequential stops that are physically
    close, indicating spatial grouping was considered.
-   [ ] **Configures the routing engine to penalize or strictly forbid U-turn
    maneuvers between stops.** Read
    [references/avoid-making-u-turn-multi-stop-vehicle-route.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/avoid-making-u-turn-multi-stop-vehicle-route.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When operational rules require minimizing complex or
    illegal turn movements. *Evidence Checkpoint*: The generated polyline and
    sequence of maneuvers between stops do not contain U-turns.
-   [ ] **Selects from a set of standard optimization goals (e.g., minimizing
    distance, time, or cost).** Read
    [references/optimize-for-pre-defined-objectives.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/optimize-for-pre-defined-objectives.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When choosing the primary optimization goal for the
    route plan (e.g., fastest route vs. shortest distance). *Evidence
    Checkpoint*: The final metrics demonstrate that the chosen objective (e.g.,
    minimum total travel time) was prioritized in the solution.
-   [ ] **Implements a priority constraint ensuring higher weight shipments are
    scheduled earlier in the route.** Read
    [references/deliver-heavier-shipments-first.md](https://www.gstatic.com/googlemapsplatform-agent-skills/route-optimization-api-web-api/references/deliver-heavier-shipments-first.md).
    *Dependencies*:
    `["references/return-multi-stop-delivery-plan-optimized-based-specified-routing-cost-shipment.md"]`
    *Trigger Condition*: When inventory management or vehicle unloading strategy
    requires heavy items to be delivered early. *Evidence Checkpoint*: The
    shipment sequencing within the optimized route reflects decreasing
    load/weight carried over time.
