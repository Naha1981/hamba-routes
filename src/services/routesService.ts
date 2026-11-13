import {
  PetStop,
  RouteLeg,
  Weekday,
  TodayRoutePlan,
  TodayStopEntry,
  TodayStopExecutionStatus,
  WEEKDAY_COLORS
} from '../types';
import { calculateRouteResult } from '../utils/tspSolver';
import { optimizeTourSequence } from '../utils/weekdayZones';
import {
  decodePolyline,
  formatDistance,
  formatDuration,
  estimateDrivingDistance,
  estimateDrivingDuration,
  generateCurvedStreetPoints,
  densifyPolyline
} from '../utils/geoUtils';
import { FUNNY_HAZARDS, JHB_VEHICLES } from '../data/mockPetStops';

export const ROUTES_API_MAX_INTERMEDIATES = 25;

/**
 * Builds an ISO-8601 departure timestamp aligned to Africa/Johannesburg (SAST, UTC+2)
 * guaranteed to be in the future for Routes API TRAFFIC_AWARE routing.
 */
function buildJohannesburgDepartureIso(depMinutes: number = 420): string {
  const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const nowSast = new Date(nowMs + SAST_OFFSET_MS);

  const hrs = Math.floor(depMinutes / 60);
  const mins = depMinutes % 60;

  let targetUtcMs =
    Date.UTC(nowSast.getUTCFullYear(), nowSast.getUTCMonth(), nowSast.getUTCDate(), hrs, mins, 0, 0) -
    SAST_OFFSET_MS;

  if (targetUtcMs <= nowMs + 60_000) {
    targetUtcMs += 24 * 60 * 60 * 1000;
  }

  return new Date(targetUtcMs).toISOString();
}

/**
 * Fetches real Google Maps route polylines between ordered stops.
 * Automatically chunks loops exceeding 25 intermediates to respect Routes API limits.
 */
export async function computeRealRouteLegs(orderedStops: PetStop[], depMinutes?: number): Promise<RouteLeg[] | null> {
  if (orderedStops.length < 2) return [];

  const departureTime = buildJohannesburgDepartureIso(depMinutes !== undefined ? depMinutes : 420);
  const loopStops: PetStop[] = [...orderedStops, orderedStops[0]];

  const MAX_CHUNK_INTERMEDIATES = 25;
  const resultLegs: RouteLeg[] = [];
  let legCounter = 0;
  const totalLegs = orderedStops.length;

  try {
    let startIdx = 0;
    while (startIdx < loopStops.length - 1) {
      const endIdx = Math.min(loopStops.length - 1, startIdx + MAX_CHUNK_INTERMEDIATES + 1);
      const chunkStops = loopStops.slice(startIdx, endIdx + 1);
      const originStop = chunkStops[0];
      const destStop = chunkStops[chunkStops.length - 1];
      const intermediateStops = chunkStops.slice(1, -1);

      const requestPayload: any = {
        origin: originStop.location,
        destination: destStop.location,
        intermediates: intermediateStops.map(s => s.location),
        departureTime
      };

      const response = await fetch('/api/routes/compute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        if (response.status === 429 || errBody?.error?.status === 'RESOURCE_EXHAUSTED') {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('routes-api-call', {
            detail: {
              type: 'Routes API (directions and polylines)',
              request: requestPayload,
              error: `Server returned status: ${response.status}`
            }
          }));
        }
        return null;
      }

      const data = await response.json();
      if (data?.error?.status === 'RESOURCE_EXHAUSTED') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        return null;
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('routes-api-call', {
          detail: {
            type: 'Routes API (directions and polylines)',
            request: requestPayload,
            response: data
          }
        }));
      }

      const gRoute = data?.routes?.[0];
      if (!gRoute) {
        return null;
      }

      const gLegs = gRoute.legs || [];
      for (let j = 0; j < chunkStops.length - 1; j++) {
        const fromStop = chunkStops[j];
        const toStop = chunkStops[j + 1];
        const apiLeg = gLegs[j];

        const estimatedDist = estimateDrivingDistance(fromStop.location, toStop.location);
        const distMeters = apiLeg?.distanceMeters || estimatedDist;
        const durSec = apiLeg?.duration ? parseInt(apiLeg.duration.replace('s', '')) : estimateDrivingDuration(distMeters);
        const encoded = apiLeg?.polyline?.encodedPolyline;
        const rawCoords = encoded ? decodePolyline(encoded) : generateCurvedStreetPoints(fromStop.location, toStop.location);
        const smoothCoords = densifyPolyline(rawCoords.length > 0 ? rawCoords : [fromStop.location, toStop.location], 25, 60);

        const hueProgress = totalLegs > 1 ? legCounter / (totalLegs - 1) : 0;
        const isDepotReturn = toStop.id === 'depot' || (startIdx + j + 1 === loopStops.length - 1);

        resultLegs.push({
          fromStopId: fromStop.id,
          toStopId: toStop.id,
          fromName: fromStop.name,
          toName: isDepotReturn ? `${toStop.name} (Return)` : toStop.name,
          distanceMeters: distMeters,
          distanceFormatted: formatDistance(distMeters),
          durationSeconds: durSec,
          durationFormatted: formatDuration(durSec),
          pathCoordinates: smoothCoords,
          encodedPolyline: encoded,
          color: `hsl(${190 + Math.round(140 * hueProgress)}, ${90 + Math.round(10 * hueProgress)}%, ${70 - Math.round(25 * hueProgress)}%)`,
          funnyHazard: isDepotReturn
            ? 'Returning to depot for vehicle restock & equipment check'
            : FUNNY_HAZARDS[legCounter % FUNNY_HAZARDS.length]
        });
        legCounter++;
      }

      startIdx = endIdx;
    }

    return resultLegs;
  } catch (err) {
    console.warn('Real Routes API call skipped or errored:', err);
  }
  return null;
}

/**
 * Computes real Google Routes polylines for all vehicles in a multi-vehicle fleet
 */
export async function computeFleetRouteLegs(vehicleRoutes: any[], depMinutes?: number): Promise<any[]> {
  const updatedRoutes = await Promise.all(
    vehicleRoutes.map(async (vr, idx) => {
      if (!vr.orderedStops || vr.orderedStops.length < 2) return vr;
      let usedLegs = await computeRealRouteLegs(vr.orderedStops, depMinutes);

      if (!usedLegs || usedLegs.length === 0) {
        const calcRes = calculateRouteResult(vr.orderedStops);
        usedLegs = calcRes.legs;
      }

      const preset = JHB_VEHICLES[idx];

      if (usedLegs && usedLegs.length > 0) {
        const VAN_COLOR_MAP: Record<string, string> = {
          'van-1': '#3b82f6',
          'van-2': '#10b981',
          'van-3': '#a855f7',
          'van-4': '#f59e0b',
          'van-5': '#ec4899',
          'van-6': '#06b6d4',
          'van-7': '#84cc16',
          'van-8': '#f97316'
        };
        const vanColor = vr.color || VAN_COLOR_MAP[vr.vehicleId] || '#3b82f6';

        const coloredLegs = usedLegs.map(leg => ({
          ...leg,
          vanId: vr.vehicleId,
          vehicleId: vr.vehicleId,
          color: vanColor
        }));

        let totalDist = 0;
        let totalDur = 0;
        coloredLegs.forEach(l => {
          totalDist += l.distanceMeters || 0;
          totalDur += l.durationSeconds || 0;
        });

        const nonDepotStops = (vr.orderedStops || []).filter((s: any) => s.id !== 'depot');
        const apptCount = nonDepotStops.length;
        const vanRevenue = vr.revenue || nonDepotStops.reduce((acc: number, s: any) => acc + (s.serviceCost || 450), 0) || (apptCount * 450);

        const totalServiceMin = nonDepotStops.reduce((acc: number, s: any) => acc + (s.durationMin || 25), 0);
        const shiftMin = Math.round(totalDur / 60) + totalServiceMin;
        const hrs = Math.floor(shiftMin / 60);
        const mins = shiftMin % 60;

        return {
          ...vr,
          vehicleLabel: vr.vehicleLabel || preset?.vehicleLabel || `Vehicle 0${idx + 1}`,
          technicianName: vr.technicianName || preset?.technicianName,
          depotName: vr.depotName || preset?.depotName,
          depotAddress: vr.depotAddress || preset?.depotAddress,
          depotLocation: vr.depotLocation || preset?.depotLocation,
          shiftSchedule: vr.shiftSchedule || (preset ? `${preset.shiftDays} ${preset.shiftStart}–${preset.shiftEnd}` : 'Mon–Fri 07:00–16:00'),
          appointmentCount: apptCount,
          revenue: vanRevenue,
          orderedStops: vr.orderedStops,
          stops: vr.orderedStops,
          legs: coloredLegs,
          totalDistanceMeters: totalDist,
          totalDurationSeconds: totalDur,
          totalDurationMin: Math.round(totalDur / 60),
          formattedTotalDistance: formatDistance(totalDist),
          formattedTotalDuration: formatDuration(totalDur),
          shiftDurationMinutes: shiftMin,
          formattedShiftDuration: hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
        };
      }

      const nonDepotStops = (vr.orderedStops || []).filter((s: any) => s.id !== 'depot');
      const apptCount = nonDepotStops.length;
      const vanRevenue = vr.revenue || nonDepotStops.reduce((acc: number, s: any) => acc + (s.serviceCost || 450), 0) || (apptCount * 450);

      return {
        ...vr,
        vehicleLabel: vr.vehicleLabel || preset?.vehicleLabel || `Vehicle 0${idx + 1}`,
        technicianName: vr.technicianName || preset?.technicianName,
        depotName: vr.depotName || preset?.depotName,
        depotAddress: vr.depotAddress || preset?.depotAddress,
        depotLocation: vr.depotLocation || preset?.depotLocation,
        shiftSchedule: vr.shiftSchedule || (preset ? `${preset.shiftDays} ${preset.shiftStart}–${preset.shiftEnd}` : 'Mon–Fri 07:00–16:00'),
        appointmentCount: apptCount,
        revenue: vanRevenue,
        orderedStops: vr.orderedStops || [vr.orderedStops?.[0]],
        stops: vr.orderedStops || [vr.orderedStops?.[0]],
        legs: []
      };
    })
  );

  return updatedRoutes;
}

/**
 * Generates an operational Hamba Routes Field Dispatch Report
 */
export async function generateGroomingReport(stops: PetStop[], totalDistance: string, totalDuration: string) {
  try {
    const response = await fetch('/api/ai/grooming-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops, totalDistance, totalDuration })
    });

    if (response.ok) {
      const data = await response.json();
      return data.report;
    }
  } catch (err) {
    console.warn('Dispatch report generation error:', err);
  }

  return `🚐 HAMBA ROUTES DISPATCH BRIEFING:
- Total Route: ${totalDistance} across ${stops.length} customer visits (${totalDuration} drive time).
- Service Mix: Pool Cleaning, Pest Control & Garden Services (Johannesburg North).
- Shift Window: Mon–Fri 07:00–16:00 SAST (Africa/Johannesburg).

📦 VEHICLE EQUIPMENT CHECK:
- Pool chlorine & HTH test strips stocked
- Pest perimeter sprayers & bait stations loaded
- Brushcutters, blowers & green-waste bags ready`;
}

const CLIENT_MATRIX_CACHE_PREFIX = 'hamba_matrix_cache_v1_';
const clientMatrixMemoryCache = new Map<string, import('../types').CachedMatrixEntry>();

function buildLocalFallbackMatrix(
  candidateLocation: import('../types').LatLng,
  routeNodes: Array<{ id: string; location: import('../types').LatLng }>
): Record<string, import('../types').MatrixPairResult> {
  const map: Record<string, import('../types').MatrixPairResult> = {};
  for (const node of routeNodes) {
    const dist = estimateDrivingDistance(candidateLocation, node.location);
    const dur = estimateDrivingDuration(dist);
    map[node.id] = {
      nodeId: node.id,
      distanceMeters: dist,
      durationSeconds: dur
    };
  }
  return map;
}

/**
 * Fetches ONE Distance Matrix between candidateLocation and all unique routeNodes,
 * caching the result in memory + sessionStorage so insertion maths across all 5 weekdays x vehicles
 * never re-triggers extra API calls.
 */
export async function fetchPlacementMatrix(
  candidateLocation: import('../types').LatLng,
  routeNodes: Array<{ id: string; location: import('../types').LatLng }>,
  departureMinutes: number = 420
): Promise<{ entry: import('../types').CachedMatrixEntry; cacheHit: boolean; error?: string }> {
  const uniqueNodesMap = new Map<string, { id: string; location: import('../types').LatLng }>();
  routeNodes.forEach((n) => {
    if (n.id && n.location && !uniqueNodesMap.has(n.id)) {
      uniqueNodesMap.set(n.id, n);
    }
  });
  const uniqueNodes = Array.from(uniqueNodesMap.values());

  const nodeSig = uniqueNodes
    .map((n) => `${n.id}:${n.location.lat.toFixed(4)},${n.location.lng.toFixed(4)}`)
    .sort()
    .join('|');
  const cacheKey = `${candidateLocation.lat.toFixed(5)},${candidateLocation.lng.toFixed(5)}::${uniqueNodes.length}::${nodeSig.length}`;

  const memCached = clientMatrixMemoryCache.get(cacheKey);
  if (memCached && Date.now() - memCached.fetchedAt < 30 * 60 * 1000) {
    return { entry: memCached, cacheHit: true };
  }

  if (typeof window !== 'undefined') {
    try {
      const rawSession = sessionStorage.getItem(`${CLIENT_MATRIX_CACHE_PREFIX}${cacheKey}`);
      if (rawSession) {
        const parsed = JSON.parse(rawSession) as import('../types').CachedMatrixEntry;
        if (parsed && parsed.distancesByNodeId && Date.now() - parsed.fetchedAt < 30 * 60 * 1000) {
          clientMatrixMemoryCache.set(cacheKey, parsed);
          return { entry: parsed, cacheHit: true };
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }

  let fetchError: string | undefined;

  try {
    const response = await fetch('/api/routes/matrix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        candidateLocation,
        nodes: uniqueNodes.map((n) => ({
          id: n.id,
          lat: n.location.lat,
          lng: n.location.lng
        })),
        departureMinutes
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.apiStatus === 429) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        fetchError = 'Google Maps Platform quota exceeded. Using local distance estimates.';
      }
      const entry: import('../types').CachedMatrixEntry = {
        cacheKey,
        source: data?.source === 'google_routes_matrix' ? 'google_routes_matrix' : 'estimated_fallback',
        fetchedAt: Date.now(),
        distancesByNodeId: data?.distancesByNodeId || buildLocalFallbackMatrix(candidateLocation, uniqueNodes)
      };

      if (!fetchError) {
        clientMatrixMemoryCache.set(cacheKey, entry);
      }
      if (typeof window !== 'undefined') {
        if (!fetchError) {
          try {
            sessionStorage.setItem(`${CLIENT_MATRIX_CACHE_PREFIX}${cacheKey}`, JSON.stringify(entry));
          } catch {
            // Ignore storage quota errors
          }
        }
        window.dispatchEvent(
          new CustomEvent('routes-api-call', {
            detail: {
              type: 'Routes API (computeRouteMatrix cached insertion check)',
              request: { candidateLocation, nodesCount: uniqueNodes.length, departureMinutes },
              response: { source: entry.source, cacheHit: Boolean(data?.cacheHit), elements: uniqueNodes.length },
              ...(fetchError ? { error: fetchError } : {})
            }
          })
        );
      }

      return { entry, cacheHit: Boolean(data?.cacheHit), error: fetchError };
    } else {
      const errBody = await response.json().catch(() => null);
      const isQuota = response.status === 429 || errBody?.error?.status === 'RESOURCE_EXHAUSTED';
      if (isQuota && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      fetchError = isQuota
        ? 'Google Maps Platform quota exceeded. Showing estimated travel times.'
        : errBody?.error?.message || errBody?.error || `Distance matrix request failed (HTTP ${response.status}). Using local estimates.`;
    }
  } catch (err: any) {
    console.warn('Placement distance matrix fetch failed, using local estimation:', err);
    fetchError = err?.message
      ? `Unable to reach distance matrix service (${err.message}). Using local distance estimates.`
      : 'Unable to reach distance matrix service. Using local distance estimates.';
  }

  const fallbackEntry: import('../types').CachedMatrixEntry = {
    cacheKey,
    source: 'estimated_fallback',
    fetchedAt: Date.now(),
    distancesByNodeId: buildLocalFallbackMatrix(candidateLocation, uniqueNodes)
  };
  return { entry: fallbackEntry, cacheHit: false, error: fetchError };
}

/**
 * Resolves a short Google Maps link (maps.app.goo.gl / goo.gl/maps) into { lat, lng }.
 */
export async function resolveShortPinUrl(url: string): Promise<{ location?: import('../types').LatLng; error?: string }> {
  try {
    const response = await fetch('/api/maps/resolve-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.location) {
      return { location: data.location };
    }
    return { error: data?.error || 'Could not resolve short Google Maps pin link.' };
  } catch (err: any) {
    return { error: err?.message || 'Network error resolving Google Maps link.' };
  }
}

function formatMin24h(totalMinutes: number): string {
  const hrs = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.round(totalMinutes % 60);
  const safeHrs = mins === 60 ? (hrs + 1) % 24 : hrs;
  const safeMins = mins === 60 ? 0 : mins;
  return `${String(safeHrs).padStart(2, '0')}:${String(safeMins).padStart(2, '0')}`;
}

function getJohannesburgTrafficMultiplier(minutesOfDay: number): number {
  // Morning Joburg peak (06:30–09:00) & Afternoon peak (15:15–18:00)
  if (minutesOfDay >= 390 && minutesOfDay <= 540) return 1.28;
  if (minutesOfDay >= 915 && minutesOfDay <= 1080) return 1.32;
  if (minutesOfDay > 540 && minutesOfDay < 915) return 1.08;
  return 1.0;
}

/**
 * Computes Today's Route for a chosen (weekday, vehicle) pair:
 * - Filters Done / Skipped stops & re-optimises only remaining pending stops
 * - Enforces the Routes API 25-intermediate waypoint cap and returns any overflow stops
 * - Calls Routes API computeRoutes with optimizeWaypointOrder: true & TRAFFIC_AWARE departureTime
 * - Produces traffic-aware arrival times (HH:MM), leg distances, total km, and total drive time
 */
export async function computeTodayTrafficRoute(params: {
  weekday: Weekday;
  vehicleId: string;
  vehicleLabel: string;
  technicianName: string;
  depotStop: PetStop;
  assignedStops: PetStop[];
  stopStatuses: Record<string, TodayStopExecutionStatus>;
  departureMinutes: number;
  maxShiftMinutes?: number;
}): Promise<TodayRoutePlan> {
  const {
    weekday,
    vehicleId,
    vehicleLabel,
    technicianName,
    depotStop,
    assignedStops,
    stopStatuses,
    departureMinutes,
    maxShiftMinutes = 540
  } = params;

  const doneStops: PetStop[] = [];
  const skippedStops: PetStop[] = [];
  const pendingStops: PetStop[] = [];

  for (const s of assignedStops) {
    const st = stopStatuses[s.id] || 'pending';
    if (st === 'done') doneStops.push(s);
    else if (st === 'skipped') skippedStops.push(s);
    else pendingStops.push(s);
  }

  const completedEntries: Array<{ stop: PetStop; status: 'done' | 'skipped' }> = [
    ...doneStops.map((stop) => ({ stop, status: 'done' as const })),
    ...skippedStops.map((stop) => ({ stop, status: 'skipped' as const }))
  ];

  const waypointCapExceeded = pendingStops.length > ROUTES_API_MAX_INTERMEDIATES;
  const cappedPending = pendingStops.slice(0, ROUTES_API_MAX_INTERMEDIATES);
  const overflowStops = pendingStops.slice(ROUTES_API_MAX_INTERMEDIATES);

  const originStop = doneStops.length > 0 ? doneStops[doneStops.length - 1] : depotStop;
  const startingFromStopName = doneStops.length > 0 ? originStop.name : undefined;
  const departureTimeStr = formatMin24h(departureMinutes);
  const dayColor = WEEKDAY_COLORS[weekday] || '#f59e0b';

  if (cappedPending.length === 0) {
    return {
      weekday,
      vehicleId,
      vehicleLabel,
      technicianName,
      depotName: depotStop.name,
      depotAddress: depotStop.address,
      depotStop,
      departureTimeStr,
      departureMinutes,
      startingFromStopName,
      activeEntries: [],
      completedEntries,
      overflowStops,
      waypointCapExceeded,
      maxWaypointsAllowed: ROUTES_API_MAX_INTERMEDIATES,
      legs: [],
      totalDistanceMeters: 0,
      totalDriveSeconds: 0,
      totalServiceMinutes: 0,
      returnToDepotTime: departureTimeStr,
      exceedsShift: false,
      source: 'estimated_traffic'
    };
  }

  const departureIso = buildJohannesburgDepartureIso(departureMinutes);

  let orderedActiveStops = optimizeTourSequence(originStop.location, cappedPending);
  let routeLegs: RouteLeg[] = [];
  let source: 'routes_api_traffic' | 'estimated_traffic' = 'estimated_traffic';
  let warning: string | undefined;

  try {
    const requestPayload = {
      origin: originStop.location,
      destination: depotStop.location,
      intermediates: cappedPending.map((s) => s.location),
      departureTime: departureIso,
      optimizeWaypointOrder: cappedPending.length > 1
    };

    const response = await fetch('/api/routes/compute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (response.ok) {
      const data = await response.json();
      if (data?.error?.status === 'RESOURCE_EXHAUSTED') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        warning = 'Google Maps Platform quota exceeded. Showing estimated Johannesburg traffic ETAs.';
      }

      const gRoute = data?.routes?.[0];
      if (gRoute && Array.isArray(gRoute.legs) && gRoute.legs.length > 0) {
        const optIdx: number[] | undefined = gRoute.optimizedIntermediateWaypointIndex;
        if (Array.isArray(optIdx) && optIdx.length === cappedPending.length) {
          const valid = optIdx.every((idx) => typeof idx === 'number' && idx >= 0 && idx < cappedPending.length);
          if (valid) {
            orderedActiveStops = optIdx.map((idx) => cappedPending[idx]);
          }
        } else {
          orderedActiveStops = [...cappedPending];
        }

        const fullChain = [originStop, ...orderedActiveStops, depotStop];
        routeLegs = [];
        for (let i = 0; i < fullChain.length - 1; i++) {
          const fromS = fullChain[i];
          const toS = fullChain[i + 1];
          const apiLeg = gRoute.legs[i];
          const estDist = estimateDrivingDistance(fromS.location, toS.location);
          const distMeters = apiLeg?.distanceMeters || estDist;
          const durSec = apiLeg?.duration
            ? parseInt(String(apiLeg.duration).replace('s', ''), 10)
            : estimateDrivingDuration(distMeters);
          const encoded = apiLeg?.polyline?.encodedPolyline;
          const rawCoords = encoded
            ? decodePolyline(encoded)
            : generateCurvedStreetPoints(fromS.location, toS.location);
          const smoothCoords = densifyPolyline(
            rawCoords.length > 0 ? rawCoords : [fromS.location, toS.location],
            25,
            60
          );

          const isReturn = i === fullChain.length - 2;
          routeLegs.push({
            fromStopId: fromS.id,
            toStopId: isReturn ? depotStop.id : toS.id,
            fromName: fromS.name,
            toName: isReturn ? `${depotStop.name} (Return)` : toS.name,
            distanceMeters: distMeters,
            distanceFormatted: formatDistance(distMeters),
            durationSeconds: durSec,
            durationFormatted: formatDuration(durSec),
            pathCoordinates: smoothCoords,
            encodedPolyline: encoded,
            color: dayColor,
            vanId: vehicleId,
            vanLabel: vehicleLabel,
            weekday
          });
        }
        source = 'routes_api_traffic';

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('routes-api-call', {
              detail: {
                type: `Routes API (Today's Route · ${weekday} ${vehicleLabel})`,
                request: requestPayload,
                response: {
                  optimizedIntermediateWaypointIndex: gRoute.optimizedIntermediateWaypointIndex,
                  legsCount: routeLegs.length
                }
              }
            })
          );
        }
      }
    } else {
      const errBody = await response.json().catch(() => null);
      const isQuota = response.status === 429 || errBody?.error?.status === 'RESOURCE_EXHAUSTED';
      if (isQuota && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      warning = isQuota
        ? 'Google Maps Platform quota exceeded. Showing estimated Johannesburg traffic ETAs.'
        : errBody?.error?.message || errBody?.error || `Live Routes API returned HTTP ${response.status}. Using estimated traffic ETAs.`;
    }
  } catch (err: any) {
    console.warn("Today's route Routes API skipped or errored, using local traffic estimation:", err);
    warning = err?.message
      ? `Live traffic lookup unavailable (${err.message}). Using estimated Johannesburg traffic ETAs.`
      : 'Live traffic lookup unavailable. Using estimated Johannesburg traffic ETAs.';
  }

  // Fallback / local street-interpolated + JHB time-of-day traffic simulation
  if (routeLegs.length === 0) {
    const fullChain = [originStop, ...orderedActiveStops, depotStop];
    let simClock = departureMinutes;
    routeLegs = [];
    for (let i = 0; i < fullChain.length - 1; i++) {
      const fromS = fullChain[i];
      const toS = fullChain[i + 1];
      const isReturn = i === fullChain.length - 2;
      const distMeters = estimateDrivingDistance(fromS.location, toS.location);
      const baseDurSec = estimateDrivingDuration(distMeters);
      const trafficFactor = getJohannesburgTrafficMultiplier(simClock);
      const durSec = Math.max(90, Math.round(baseDurSec * trafficFactor));
      simClock += Math.max(1, durSec / 60) + (isReturn ? 0 : toS.durationMin || 25);

      routeLegs.push({
        fromStopId: fromS.id,
        toStopId: isReturn ? depotStop.id : toS.id,
        fromName: fromS.name,
        toName: isReturn ? `${depotStop.name} (Return)` : toS.name,
        distanceMeters: distMeters,
        distanceFormatted: formatDistance(distMeters),
        durationSeconds: durSec,
        durationFormatted: formatDuration(durSec),
        pathCoordinates: densifyPolyline(generateCurvedStreetPoints(fromS.location, toS.location), 18, 45),
        color: dayColor,
        vanId: vehicleId,
        vanLabel: vehicleLabel,
        weekday
      });
    }
  }

  // Walk legs cumulatively to produce exact traffic-aware ETAs at each stop
  let cursorMin = departureMinutes;
  let totalDist = 0;
  let totalDriveSec = 0;
  let totalServiceMin = 0;
  const activeEntries: TodayStopEntry[] = [];

  for (let i = 0; i < orderedActiveStops.length; i++) {
    const stop = orderedActiveStops[i];
    const leg = routeLegs[i];
    const legDist = leg?.distanceMeters || 0;
    const legDurSec = leg?.durationSeconds || 0;
    totalDist += legDist;
    totalDriveSec += legDurSec;

    const driveMins = Math.max(1, Math.round(legDurSec / 60));
    const arrMin = cursorMin + driveMins;
    const durMin = stop.durationMin || 25;
    totalServiceMin += durMin;
    const depMinFromStop = arrMin + durMin;

    activeEntries.push({
      sequenceNumber: i + 1,
      stop,
      arrivalTime: formatMin24h(arrMin),
      departureTime: formatMin24h(depMinFromStop),
      legDistanceMeters: legDist,
      legDurationSeconds: legDurSec,
      status: 'pending'
    });

    cursorMin = depMinFromStop;
  }

  // Add return-to-depot leg
  const returnLeg = routeLegs[orderedActiveStops.length];
  if (returnLeg) {
    totalDist += returnLeg.distanceMeters || 0;
    totalDriveSec += returnLeg.durationSeconds || 0;
    cursorMin += Math.max(1, Math.round((returnLeg.durationSeconds || 0) / 60));
  }

  const returnToDepotTime = formatMin24h(cursorMin);
  const exceedsShift = cursorMin - departureMinutes > maxShiftMinutes || cursorMin > 960;

  return {
    weekday,
    vehicleId,
    vehicleLabel,
    technicianName,
    depotName: depotStop.name,
    depotAddress: depotStop.address,
    depotStop,
    departureTimeStr,
    departureMinutes,
    startingFromStopName,
    activeEntries,
    completedEntries,
    overflowStops,
    waypointCapExceeded,
    maxWaypointsAllowed: ROUTES_API_MAX_INTERMEDIATES,
    legs: routeLegs,
    totalDistanceMeters: totalDist,
    totalDriveSeconds: totalDriveSec,
    totalServiceMinutes: totalServiceMin,
    returnToDepotTime,
    exceedsShift,
    source,
    ...(warning ? { warning } : {})
  };
}
