import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
app.set("trust proxy", 2);
const PORT = Number(process.env.PORT || 3000);
const OPEN_MAPS = process.env.MAP_PROVIDER === 'open';

app.use(express.json());

// Johannesburg Fleet Presets (3 Vehicles with Depots & Mon-Fri 07:00-16:00 shift)
const JHB_VEHICLE_PRESETS = [
  {
    vehicleId: 'van-1',
    vehicleLabel: 'Vehicle 01',
    technicianName: 'Thabo Mokoena',
    color: '#3b82f6',
    depotName: 'Sandton Depot',
    depotAddress: '84 Rivonia Rd, Sandown, Sandton',
    depotLocation: { lat: -26.1076, lng: 28.0567, altitude: 1500 },
    shiftSchedule: 'Mon–Fri 07:00–16:00'
  },
  {
    vehicleId: 'van-2',
    vehicleLabel: 'Vehicle 02',
    technicianName: 'Johan van der Merwe',
    color: '#10b981',
    depotName: 'Randburg Depot',
    depotAddress: '312 Jan Smuts Ave, Craighall, Randburg',
    depotLocation: { lat: -26.1135, lng: 28.0185, altitude: 1520 },
    shiftSchedule: 'Mon–Fri 07:00–16:00'
  },
  {
    vehicleId: 'van-3',
    vehicleLabel: 'Vehicle 03',
    technicianName: 'Priya Naidoo',
    color: '#a855f7',
    depotName: 'Midrand Depot',
    depotAddress: '156 Allan Rd, Vorna Valley, Midrand',
    depotLocation: { lat: -26.0045, lng: 28.1215, altitude: 1540 },
    shiftSchedule: 'Mon–Fri 07:00–16:00'
  }
];

// API Key getter (Backend Secret for Google Maps Platform Routes API)
const getBackendMapsApiKey = () => {
  if (OPEN_MAPS) return '';
  return process.env.GOOGLE_MAPS_API_KEY_BACKEND || process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
};

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 2. Config status
app.get('/api/config', (req, res) => {
  res.json({
    hasBackendMapsKey: Boolean(getBackendMapsApiKey()),
    hasClientMapsKey: Boolean(process.env.VITE_GOOGLE_MAPS_API_KEY)
  });
});

const openRouteCache = new Map<string, any>();
let openRouteBusy=false,lastOpenRouteAt=0;

// 4. Compute Routes API Proxy
const ROUTES_API_MAX_INTERMEDIATES = 25;

app.post('/api/routes/compute', async (req, res) => {
  const apiKey = getBackendMapsApiKey();
  const { origin, destination, intermediates, departureTime, optimizeWaypointOrder } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'Origin and destination are required.' });
  }

  const submittedIntermediatesCount = Array.isArray(intermediates) ? intermediates.length : 0;
  const waypointCapExceeded = submittedIntermediatesCount > ROUTES_API_MAX_INTERMEDIATES;

  if (OPEN_MAPS) {
    const points=[origin,...(Array.isArray(intermediates)?intermediates:[]),destination];
    if(points.length>27 || points.some(p=>!Number.isFinite(p?.lat)||!Number.isFinite(p?.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)) return res.status(400).json({error:'Invalid coordinates or too many stops.'});
    try {
      if(process.env.NODE_ENV==='production' && !process.env.OSRM_BASE_URL) return res.status(503).json({error:'Configure a self-hosted or explicitly authorised OSRM service for production. Public demo is for non-commercial tests only.'});
      const base=process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
      const key=JSON.stringify(points);
      let data=openRouteCache.get(key);
      if(!data){
        if(openRouteBusy || Date.now()-lastOpenRouteAt<1100) return res.status(429).json({error:'Please wait before the next open routing request.'});
        openRouteBusy=true;lastOpenRouteAt=Date.now();
        try {const response=await fetch(`${base}/route/v1/driving/${points.map(p=>`${p.lng},${p.lat}`).join(';')}?steps=true&overview=full&geometries=geojson`,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'HambaRoutes-IsolatedTest/1.0 (https://github.com/Naha1981/hamba-routes)'}});if(!response.ok)throw new Error(`Routing service HTTP ${response.status}`);data=await response.json();if(data.code!=='Ok'||!data.routes?.[0])throw new Error('No drivable road route found.');openRouteCache.set(key,data);}finally{openRouteBusy=false;}
      }
      const encode=(coords:number[][])=>{let lat=0,lng=0,out='';const emit=(v:number)=>{let n=v<0?~(v<<1):(v<<1);while(n>=32){out+=String.fromCharCode((32|(n&31))+63);n>>=5;}out+=String.fromCharCode(n+63);};for(const c of coords){const a=Math.round(c[1]*1e5),b=Math.round(c[0]*1e5);emit(a-lat);emit(b-lng);lat=a;lng=b;}return out;};
      const route=data.routes[0];return res.json({provider:'osrm',trafficAware:false,routes:[{distanceMeters:route.distance,duration:`${Math.round(route.duration)}s`,legs:route.legs.map((l:any)=>({distanceMeters:l.distance,duration:`${Math.round(l.duration)}s`,polyline:{encodedPolyline:encode(l.steps.flatMap((s:any)=>s.geometry.coordinates))}}))}],waypointCapExceeded:false,maxIntermediates:25});
    }catch(e:any){return res.status(502).json({error:'Open road routing unavailable. Estimates only, not verified road routes.',detail:e.message});}
  }

  if (!apiKey) {
    return res.json({
      routes: [],
      waypointCapExceeded,
      maxIntermediates: ROUTES_API_MAX_INTERMEDIATES
    });
  }

  try {
    const extractLatLng = (point: any) => {
      if (!point) return null;
      if (point.location?.latLng) {
        const lat = point.location.latLng.latitude ?? point.location.latLng.lat;
        const lng = point.location.latLng.longitude ?? point.location.latLng.lng;
        if (lat !== undefined && lng !== undefined) return { lat: Number(lat), lng: Number(lng) };
      }
      if (point.location) {
        const lat = point.location.lat ?? point.location.latitude;
        const lng = point.location.lng ?? point.location.longitude;
        if (lat !== undefined && lng !== undefined) return { lat: Number(lat), lng: Number(lng) };
      }
      if (point.latLng) {
        const lat = point.latLng.latitude ?? point.latLng.lat;
        const lng = point.latLng.longitude ?? point.latLng.lng;
        if (lat !== undefined && lng !== undefined) return { lat: Number(lat), lng: Number(lng) };
      }
      const lat = point.lat ?? point.latitude;
      const lng = point.lng ?? point.longitude;
      if (lat !== undefined && lng !== undefined) return { lat: Number(lat), lng: Number(lng) };
      return null;
    };

    const orig = extractLatLng(origin);
    const dest = extractLatLng(destination);
    if (!orig || !dest) {
      return res.status(400).json({ error: 'Valid origin and destination coordinates are required.' });
    }

    const bodyPayload: any = {
      origin: {
        location: { latLng: { latitude: orig.lat, longitude: orig.lng } }
      },
      destination: {
        location: { latLng: { latitude: dest.lat, longitude: dest.lng } }
      },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: false,
      polylineQuality: 'HIGH_QUALITY'
    };

    if (departureTime) {
      const depDate = new Date(departureTime);
      const now = new Date();
      // Ensure departure time is in the future so Google Routes API never errors with 400
      if (depDate.getTime() <= now.getTime() + 60000) {
        depDate.setDate(depDate.getDate() + 1);
      }
      bodyPayload.departureTime = depDate.toISOString();
    } else if (req.body.departureMinutes !== undefined) {
      const depMin = Number(req.body.departureMinutes);
      const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const nowSast = new Date(nowMs + SAST_OFFSET_MS);
      let targetUtcMs =
        Date.UTC(nowSast.getUTCFullYear(), nowSast.getUTCMonth(), nowSast.getUTCDate(), Math.floor(depMin / 60), depMin % 60, 0) -
        SAST_OFFSET_MS;
      if (targetUtcMs <= nowMs + 60000) {
        targetUtcMs += 24 * 60 * 60 * 1000;
      }
      bodyPayload.departureTime = new Date(targetUtcMs).toISOString();
    }

    if (intermediates && intermediates.length > 0) {
      const validIntermediates: any[] = [];
      for (const item of intermediates.slice(0, ROUTES_API_MAX_INTERMEDIATES)) {
        const coords = extractLatLng(item);
        if (coords) {
          validIntermediates.push({
            location: { latLng: { latitude: coords.lat, longitude: coords.lng } }
          });
        }
      }
      if (validIntermediates.length > 0) {
        bodyPayload.intermediates = validIntermediates;
        if (optimizeWaypointOrder && validIntermediates.length > 1) {
          bodyPayload.optimizeWaypointOrder = true;
        }
      }
    }

    const fieldMask = bodyPayload.optimizeWaypointOrder
      ? 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex,routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline'
      : 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline';

    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Routes API compute returned error:', errText);
      try {
        const parsed = JSON.parse(errText);
        return res.status(response.status).json(parsed);
      } catch {
        return res.status(response.status).json({ error: errText });
      }
    }

    const data = await response.json();
    res.json({
      ...data,
      waypointCapExceeded,
      maxIntermediates: ROUTES_API_MAX_INTERMEDIATES
    });
  } catch (error: any) {
    console.error('Routes API Compute error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4a. Cached Routes Matrix Proxy (single API call for candidate customer -> all route nodes)
const serverMatrixCache = new Map<
  string,
  {
    source: 'google_routes_matrix' | 'estimated_fallback';
    fetchedAt: number;
    distancesByNodeId: Record<string, { nodeId: string; distanceMeters: number; durationSeconds: number }>;
  }
>();

const buildMatrixFallback = (
  candidate: { lat: number; lng: number },
  nodes: Array<{ id: string; lat: number; lng: number }>
) => {
  const distancesByNodeId: Record<string, { nodeId: string; distanceMeters: number; durationSeconds: number }> = {};
  for (const node of nodes) {
    const dLat = (node.lat - candidate.lat) * (Math.PI / 180);
    const dLng = (node.lng - candidate.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(candidate.lat * (Math.PI / 180)) *
        Math.cos(node.lat * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distMeters = Math.max(150, Math.round(6371000 * c * 1.35));
    const durSec = Math.max(90, Math.round(distMeters / 6.67 + (distMeters / 1000) * 45));
    distancesByNodeId[node.id] = {
      nodeId: node.id,
      distanceMeters: distMeters,
      durationSeconds: durSec
    };
  }
  return distancesByNodeId;
};

app.post('/api/routes/matrix', async (req, res) => {
  const apiKey = getBackendMapsApiKey();
  const { candidateLocation, nodes, departureMinutes } = req.body || {};

  const cLat = Number(candidateLocation?.lat);
  const cLng = Number(candidateLocation?.lng);
  if (isNaN(cLat) || isNaN(cLng) || !Array.isArray(nodes) || nodes.length === 0) {
    return res.status(400).json({ error: 'Valid candidateLocation and route nodes are required.' });
  }

  const sanitizedNodes: Array<{ id: string; lat: number; lng: number }> = nodes
    .map((n: any) => ({
      id: String(n.id || ''),
      lat: Number(n.lat),
      lng: Number(n.lng)
    }))
    .filter((n) => n.id && !isNaN(n.lat) && !isNaN(n.lng))
    .slice(0, 625);

  if (sanitizedNodes.length === 0) {
    return res.status(400).json({ error: 'At least one valid route node is required.' });
  }

  const nodeSig = sanitizedNodes
    .map((n) => `${n.id}:${n.lat.toFixed(4)},${n.lng.toFixed(4)}`)
    .sort()
    .join('|');
  const cacheKey = `${cLat.toFixed(5)},${cLng.toFixed(5)}::${nodeSig}`;

  const cached = serverMatrixCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000) {
    return res.json({
      cacheKey,
      cacheHit: true,
      source: cached.source,
      fetchedAt: cached.fetchedAt,
      distancesByNodeId: cached.distancesByNodeId
    });
  }

  if (!apiKey) {
    const fallbackMap = buildMatrixFallback({ lat: cLat, lng: cLng }, sanitizedNodes);
    const entry = {
      source: 'estimated_fallback' as const,
      fetchedAt: Date.now(),
      distancesByNodeId: fallbackMap
    };
    serverMatrixCache.set(cacheKey, entry);
    return res.json({
      cacheKey,
      cacheHit: false,
      ...entry
    });
  }

  try {
    const depMin = departureMinutes !== undefined ? Number(departureMinutes) : 420;
    const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const nowSast = new Date(nowMs + SAST_OFFSET_MS);
    let targetUtcMs =
      Date.UTC(
        nowSast.getUTCFullYear(),
        nowSast.getUTCMonth(),
        nowSast.getUTCDate(),
        Math.floor(depMin / 60),
        depMin % 60,
        0
      ) - SAST_OFFSET_MS;
    if (targetUtcMs <= nowMs + 60000) {
      targetUtcMs += 24 * 60 * 60 * 1000;
    }

    const bodyPayload = {
      origins: [
        {
          waypoint: {
            location: {
              latLng: { latitude: cLat, longitude: cLng }
            }
          }
        }
      ],
      destinations: sanitizedNodes.map((n) => ({
        waypoint: {
          location: {
            latLng: { latitude: n.lat, longitude: n.lng }
          }
        }
      })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      departureTime: new Date(targetUtcMs).toISOString()
    };

    const response = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status,condition',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio'
      },
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Routes Matrix API error, falling back cleanly:', response.status, errText);
      const fallbackMap = buildMatrixFallback({ lat: cLat, lng: cLng }, sanitizedNodes);
      const entry = {
        source: 'estimated_fallback' as const,
        fetchedAt: Date.now(),
        distancesByNodeId: fallbackMap
      };
      serverMatrixCache.set(cacheKey, entry);
      return res.json({
        cacheKey,
        cacheHit: false,
        apiStatus: response.status,
        ...entry
      });
    }

    const rawElements = await response.json();
    const distancesByNodeId = buildMatrixFallback({ lat: cLat, lng: cLng }, sanitizedNodes);

    if (Array.isArray(rawElements)) {
      for (const el of rawElements) {
        const dIdx = el?.destinationIndex;
        if (typeof dIdx === 'number' && sanitizedNodes[dIdx] && el?.condition === 'ROUTE_EXISTS') {
          const node = sanitizedNodes[dIdx];
          const distMeters = Number(el.distanceMeters);
          const durSec = typeof el.duration === 'string'
            ? parseInt(el.duration.replace('s', ''), 10)
            : Number(el.duration);
          if (!isNaN(distMeters) && distMeters >= 0 && !isNaN(durSec) && durSec >= 0) {
            distancesByNodeId[node.id] = {
              nodeId: node.id,
              distanceMeters: distMeters,
              durationSeconds: durSec
            };
          }
        }
      }
    }

    const entry = {
      source: 'google_routes_matrix' as const,
      fetchedAt: Date.now(),
      distancesByNodeId
    };
    serverMatrixCache.set(cacheKey, entry);

    return res.json({
      cacheKey,
      cacheHit: false,
      ...entry
    });
  } catch (error: any) {
    console.warn('Routes Matrix proxy error, using fallback:', error?.message || error);
    const fallbackMap = buildMatrixFallback({ lat: cLat, lng: cLng }, sanitizedNodes);
    const entry = {
      source: 'estimated_fallback' as const,
      fetchedAt: Date.now(),
      distancesByNodeId: fallbackMap
    };
    serverMatrixCache.set(cacheKey, entry);
    return res.json({
      cacheKey,
      cacheHit: false,
      ...entry
    });
  }
});

// 4c. Resolve short Google Maps share links (maps.app.goo.gl / goo.gl/maps)
app.post('/api/maps/resolve-pin', async (req, res) => {
  const rawUrl = String(req.body?.url || '').trim();
  if (!/^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9_-]+/i.test(rawUrl)) {
    return res.status(400).json({ error: 'Only maps.app.goo.gl or goo.gl/maps short URLs are supported.' });
  }

  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'HambaRoutes/1.0' }
    });
    const finalUrl = response.url || rawUrl;
    const html = await response.text().catch(() => '');
    const combined = `${finalUrl}\n${html.slice(0, 24000)}`;

    const protoMatch = combined.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (protoMatch) {
      return res.json({
        resolvedUrl: finalUrl,
        location: { lat: parseFloat(protoMatch[1]), lng: parseFloat(protoMatch[2]), altitude: 1500 }
      });
    }

    const atMatch = combined.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (atMatch) {
      return res.json({
        resolvedUrl: finalUrl,
        location: { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]), altitude: 1500 }
      });
    }

    const qMatch = combined.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)[,\s+%2C]+(-?\d+(?:\.\d+)?)/i);
    if (qMatch) {
      return res.json({
        resolvedUrl: finalUrl,
        location: { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]), altitude: 1500 }
      });
    }

    return res.status(404).json({ error: 'Could not extract coordinates from the short Google Maps link.', resolvedUrl: finalUrl });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Failed to resolve short Google Maps URL.' });
  }
});

// 4b. Geographic Proximity Route Planner
const handlePlanRoutes = (req: express.Request, res: express.Response) => {
  const { stops } = req.body;

  if (!stops || stops.length === 0) {
    return res.status(400).json({ error: 'Customer stops are required.' });
  }

  const maxShiftHours = Math.max(4, Math.min(16, Number(req.body.maxShiftHours) || 9));
  const maxShiftMinutes = maxShiftHours * 60;
  const hasExplicitFleetSize = req.body.fleetSize !== undefined && Number(req.body.fleetSize) > 0;
  const isAutoFleet = (req.body.fleetAllocationMode === 'auto' && !hasExplicitFleetSize) || Number(req.body.fleetSize) === 0;

  const VAN_METAS = [
    { id: 'van-1', label: 'Vehicle 01', color: '#3b82f6' },
    { id: 'van-2', label: 'Vehicle 02', color: '#10b981' },
    { id: 'van-3', label: 'Vehicle 03', color: '#a855f7' },
    { id: 'van-4', label: 'Vehicle 04', color: '#f59e0b' },
    { id: 'van-5', label: 'Vehicle 05', color: '#ec4899' },
    { id: 'van-6', label: 'Vehicle 06', color: '#06b6d4' },
    { id: 'van-7', label: 'Vehicle 07', color: '#84cc16' },
    { id: 'van-8', label: 'Vehicle 08', color: '#f97316' }
  ];

  // Respect user's configured fleet size when provided; default is 3 vehicles
  let determinedFleetSize = Math.max(1, Math.min(8, Number(req.body.fleetSize) || 3));
  if (isAutoFleet) {
    const visitCount = Math.max(1, stops.length - 1);
    for (let testSize = 1; testSize <= 8; testSize++) {
      const stopsPerVan = Math.ceil(visitCount / testSize);
      const estShift = stopsPerVan * 35 + 30;
      if (stopsPerVan <= 14 && (estShift <= maxShiftMinutes || testSize === 8)) {
        determinedFleetSize = testSize;
        break;
      }
    }
  }

  const fleetSize = determinedFleetSize;
  const depMin = req.body.departureMinutes !== undefined ? Number(req.body.departureMinutes) : 420; // 07:00 SAST

  const isJohannesburgRegion = (stops[0]?.location?.lat ?? -26) < -20;

  const resolveDepotForVehicle = (vIdx: number, fallbackDepot: any) => {
    const preset = isJohannesburgRegion ? JHB_VEHICLE_PRESETS[vIdx] : undefined;
    if (!preset) return fallbackDepot;
    return {
      ...fallbackDepot,
      id: 'depot',
      name: preset.depotName,
      address: preset.depotAddress,
      location: preset.depotLocation
    };
  };

  const distBetween = (p1: any, p2: any) => {
    const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
    const dLng = (p2.lng - p1.lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(6371000 * c * 1.35);
  };

  const getWindowRange = (s: any) => {
    if (s.timeWindow?.start && s.timeWindow?.end) {
      const [sh, sm] = s.timeWindow.start.split(':').map(Number);
      const [eh, em] = s.timeWindow.end.split(':').map(Number);
      return { startMin: sh * 60 + sm, endMin: eh * 60 + em };
    }
    return { startMin: 420, endMin: 960 }; // 07:00 - 16:00 SAST
  };

  // Evaluate a single vehicle's sequence of visits
  const evaluateVanTour = (depot: any, visitStops: any[], depMinutes: number) => {
    let curMin = depMinutes;
    let curLoc = depot.location;
    let violations = 0;
    let waitMins = 0;
    let drivingDistMeters = 0;
    let drivingSecs = 0;
    const arrivalMinutes: number[] = [];

    for (let i = 0; i < visitStops.length; i++) {
      const visit = visitStops[i];
      const dist = distBetween(curLoc, visit.location);
      drivingDistMeters += dist;
      const driveSec = Math.max(90, Math.round(dist / 6.67 + (dist / 1000) * 45));
      drivingSecs += driveSec;
      const driveMin = Math.max(1, Math.round(driveSec / 60));

      const arrMin = curMin + driveMin;
      arrivalMinutes.push(arrMin);
      const win = getWindowRange(visit);

      if (arrMin > win.endMin) {
        violations++;
      }

      let wait = 0;
      if (arrMin < win.startMin) {
        wait = win.startMin - arrMin;
        waitMins += wait;
      }

      const serviceDuration = visit.durationMin || 25;
      curMin = arrMin + wait + serviceDuration;
      curLoc = visit.location;
    }

    // Return to depot
    const returnDist = distBetween(curLoc, depot.location);
    drivingDistMeters += returnDist;
    const returnDriveSec = Math.max(90, Math.round(returnDist / 6.67 + (returnDist / 1000) * 45));
    drivingSecs += returnDriveSec;
    const returnDriveMin = Math.max(2, Math.round(returnDriveSec / 60));
    const finalReturnMin = curMin + returnDriveMin;

    const totalShiftMinutes = finalReturnMin - depMinutes;

    return {
      violations,
      waitMins,
      drivingDistMeters,
      drivingSecs,
      drivingMin: Math.round(drivingSecs / 60),
      totalShiftMinutes,
      finalReturnMin,
      arrivalMinutes
    };
  };

  // Solve optimal permutation for a vehicle
  const solveOptimalVanSequence = (depot: any, visitStops: any[], depMinutes: number) => {
    if (visitStops.length <= 1) {
      return {
        orderedStops: visitStops,
        eval: evaluateVanTour(depot, visitStops, depMinutes)
      };
    }

    if (visitStops.length <= 7) {
      const permute = (arr: any[]): any[][] => {
        if (arr.length <= 1) return [arr];
        const res: any[][] = [];
        for (let i = 0; i < arr.length; i++) {
          const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
          for (const p of permute(rest)) {
            res.push([arr[i], ...p]);
          }
        }
        return res;
      };

      const perms = permute(visitStops);
      let bestTour = perms[0];
      let bestEval = evaluateVanTour(depot, bestTour, depMinutes);
      let bestScore = bestEval.violations * 10000000 + bestEval.drivingDistMeters + bestEval.drivingSecs * 2 + bestEval.waitMins * 800 + bestEval.totalShiftMinutes * 150;

      for (let i = 1; i < perms.length; i++) {
        const candidate = perms[i];
        const candidateEval = evaluateVanTour(depot, candidate, depMinutes);
        const score = candidateEval.violations * 10000000 + candidateEval.drivingDistMeters + candidateEval.drivingSecs * 2 + candidateEval.waitMins * 800 + candidateEval.totalShiftMinutes * 150;
        if (score < bestScore) {
          bestScore = score;
          bestEval = candidateEval;
          bestTour = candidate;
        }
      }

      return {
        orderedStops: bestTour,
        eval: bestEval
      };
    }

    // For larger stops (e.g. 40 customers across 3 vehicles = 13-14 visits/vehicle), use nearest/window sort + 2-opt & relocation
    let bestTour = [...visitStops].sort((a, b) => {
      const wa = getWindowRange(a).startMin;
      const wb = getWindowRange(b).startMin;
      if (wa !== wb) return wa - wb;
      return distBetween(depot.location, a.location) - distBetween(depot.location, b.location);
    });
    let bestEval = evaluateVanTour(depot, bestTour, depMinutes);
    let bestScore = bestEval.violations * 10000000 + bestEval.drivingDistMeters + bestEval.drivingSecs * 2 + bestEval.waitMins * 800 + bestEval.totalShiftMinutes * 150;

    let improved = true;
    let iters = 0;
    while (improved && iters < 60) {
      improved = false;
      iters++;

      for (let i = 0; i < bestTour.length - 1; i++) {
        for (let k = i + 1; k < bestTour.length; k++) {
          const candidate = [...bestTour];
          const rev = candidate.slice(i, k + 1).reverse();
          candidate.splice(i, k - i + 1, ...rev);
          const candidateEval = evaluateVanTour(depot, candidate, depMinutes);
          const score = candidateEval.violations * 10000000 + candidateEval.drivingDistMeters + candidateEval.drivingSecs * 2 + candidateEval.waitMins * 800 + candidateEval.totalShiftMinutes * 150;
          if (score < bestScore - 1) {
            bestScore = score;
            bestEval = candidateEval;
            bestTour = candidate;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }

      if (!improved) {
        for (let i = 0; i < bestTour.length; i++) {
          for (let j = 0; j < bestTour.length; j++) {
            if (i === j) continue;
            const candidate = [...bestTour];
            const [elem] = candidate.splice(i, 1);
            candidate.splice(j, 0, elem);
            const candidateEval = evaluateVanTour(depot, candidate, depMinutes);
            const score = candidateEval.violations * 10000000 + candidateEval.drivingDistMeters + candidateEval.drivingSecs * 2 + candidateEval.waitMins * 800 + candidateEval.totalShiftMinutes * 150;
            if (score < bestScore - 1) {
              bestScore = score;
              bestEval = candidateEval;
              bestTour = candidate;
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
      }
    }

    return {
      orderedStops: bestTour,
      eval: bestEval
    };
  };

  const fallbackFleetPartition = () => {
    const remainingStops = stops.slice(1);
    const depotLoc = stops[0].location;

    const scoreFleet = (buckets: any[][]) => {
      let totalDist = 0;
      let totalSecs = 0;
      let maxShift = 0;
      let minShift = Infinity;
      let violations = 0;
      let totalWait = 0;
      const solutions: any[] = [];
      for (let v = 0; v < buckets.length; v++) {
        const vanDepot = resolveDepotForVehicle(v, stops[0]);
        const res = solveOptimalVanSequence(vanDepot, buckets[v], depMin);
        solutions.push(res);
        violations += res.eval.violations;
        totalDist += res.eval.drivingDistMeters;
        totalSecs += res.eval.drivingSecs;
        totalWait += res.eval.waitMins;
        if (res.eval.totalShiftMinutes > maxShift) maxShift = res.eval.totalShiftMinutes;
        if (res.eval.totalShiftMinutes < minShift) minShift = res.eval.totalShiftMinutes;
      }
      const lengths = buckets.map(b => b.length);
      const minCount = Math.min(...lengths);
      const maxCount = Math.max(...lengths);
      const countDiff = maxCount - minCount;
      const balancePenalty = countDiff > 1 ? countDiff * 3000000 : (countDiff > 0 ? countDiff * 25000 : 0);
      const shiftSpread = maxShift - (minShift === Infinity ? 0 : minShift);
      const shiftSpreadPenalty = shiftSpread > 60 ? (shiftSpread - 60) * 800 : 0;

      let geographicDispersion = 0;
      let crossTerritoryPenalty = 0;
      const centroids = buckets.map(b => {
        if (b.length === 0) return depotLoc;
        return {
          lat: b.reduce((sum: number, s: any) => sum + s.location.lat, 0) / b.length,
          lng: b.reduce((sum: number, s: any) => sum + s.location.lng, 0) / b.length
        };
      });

      for (let v = 0; v < buckets.length; v++) {
        const myCenter = centroids[v];
        for (const s of buckets[v]) {
          const myDist = distBetween(s.location, myCenter);
          geographicDispersion += myDist;
          for (let u = 0; u < buckets.length; u++) {
            if (u === v) continue;
            const otherDist = distBetween(s.location, centroids[u]);
            if (otherDist < myDist * 0.85) {
              crossTerritoryPenalty += 1000000;
            }
          }
        }
      }

      const score =
        violations * 10000000 +
        crossTerritoryPenalty +
        balancePenalty +
        shiftSpreadPenalty +
        totalDist +
        totalSecs * 2 +
        geographicDispersion * 3 +
        maxShift * 250 +
        totalWait * 800;

      return { score, totalDist, totalSecs, maxShift, violations, totalWait, solutions, geographicDispersion, crossTerritoryPenalty };
    };

    if (fleetSize <= 1) {
      const vanDepot = resolveDepotForVehicle(0, stops[0]);
      const preset = isJohannesburgRegion ? JHB_VEHICLE_PRESETS[0] : undefined;
      const res = solveOptimalVanSequence(vanDepot, remainingStops, depMin);
      const hrs = Math.floor(res.eval.totalShiftMinutes / 60);
      const mins = res.eval.totalShiftMinutes % 60;
      const formattedShift = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

      const vanOrderedStops = [vanDepot, ...res.orderedStops].map((s: any, idx: number) => ({
        ...s,
        assignedVanId: 'van-1',
        vanOrder: idx === 0 ? 0 : idx
      }));

      return {
        solverUsed: 'Single-Vehicle VRPTW',
        fleetSize: 1,
        orderedStops: vanOrderedStops,
        vehicleRoutes: [{
          vehicleId: 'van-1',
          vehicleLabel: preset?.vehicleLabel || 'Vehicle 01',
          technicianName: preset?.technicianName,
          depotName: preset?.depotName,
          depotAddress: preset?.depotAddress,
          depotLocation: preset?.depotLocation,
          shiftSchedule: preset?.shiftSchedule || 'Mon–Fri 07:00–16:00',
          color: '#3b82f6',
          orderedStops: vanOrderedStops,
          stops: vanOrderedStops,
          legs: [],
          totalDistanceMeters: res.eval.drivingDistMeters,
          totalDurationSeconds: res.eval.drivingSecs,
          totalDurationMin: res.eval.drivingMin,
          formattedTotalDistance: `${(res.eval.drivingDistMeters / 1000).toFixed(1)} km`,
          formattedTotalDuration: `${res.eval.drivingMin} mins`,
          shiftDurationMinutes: res.eval.totalShiftMinutes,
          formattedShiftDuration: formattedShift,
          revenue: res.orderedStops.reduce((acc: number, s: any) => acc + (s.serviceCost || 450), 0),
          appointmentCount: res.orderedStops.length
        }],
        totalDistanceMeters: res.eval.drivingDistMeters,
        totalDurationSeconds: res.eval.drivingSecs,
        maxShiftDurationMinutes: res.eval.totalShiftMinutes,
        formattedMaxShiftDuration: formattedShift
      };
    }

    const candidateSeeds: any[][][] = [];
    const n = remainingStops.length;
    const minCap = Math.floor(n / fleetSize);
    const remainder = n % fleetSize;

    const meanLat = remainingStops.reduce((acc: number, s: any) => acc + s.location.lat, 0) / n;
    const meanLng = remainingStops.reduce((acc: number, s: any) => acc + s.location.lng, 0) / n;

    const sortedPolar = [...remainingStops].map(s => {
      const dy = s.location.lat - meanLat;
      const dx = (s.location.lng - meanLng) * Math.cos(meanLat * Math.PI / 180);
      return { stop: s, angle: Math.atan2(dy, dx) };
    }).sort((a, b) => a.angle - b.angle);

    for (let cut = 0; cut < n; cut++) {
      const rotated = [...sortedPolar.slice(cut), ...sortedPolar.slice(0, cut)];
      const polarBuckets: any[][] = [];
      let offset = 0;
      for (let c = 0; c < fleetSize; c++) {
        const size = minCap + (c < remainder ? 1 : 0);
        polarBuckets.push(rotated.slice(offset, offset + size).map(x => x.stop));
        offset += size;
      }
      candidateSeeds.push(polarBuckets);
    }

    const sortedNS = [...remainingStops].sort((a, b) => a.location.lat - b.location.lat);
    const nsBuckets: any[][] = [];
    let nsOffset = 0;
    for (let c = 0; c < fleetSize; c++) {
      const size = minCap + (c < remainder ? 1 : 0);
      nsBuckets.push(sortedNS.slice(nsOffset, nsOffset + size));
      nsOffset += size;
    }
    candidateSeeds.push(nsBuckets);

    const sortedEW = [...remainingStops].sort((a, b) => a.location.lng - b.location.lng);
    const ewBuckets: any[][] = [];
    let ewOffset = 0;
    for (let c = 0; c < fleetSize; c++) {
      const size = minCap + (c < remainder ? 1 : 0);
      ewBuckets.push(sortedEW.slice(ewOffset, ewOffset + size));
      ewOffset += size;
    }
    candidateSeeds.push(ewBuckets);

    const assignedBuckets: any[][] = Array.from({ length: fleetSize }, () => []);
    let allStopsAssignedValidly = remainingStops.length > 0;
    let assignedCount = 0;
    for (const s of remainingStops) {
      if (s.assignedVanId && s.assignedVanId.startsWith('van-')) {
        const vNum = parseInt(s.assignedVanId.replace('van-', ''), 10);
        if (vNum >= 1 && vNum <= fleetSize) {
          assignedBuckets[vNum - 1].push(s);
          assignedCount++;
        } else {
          allStopsAssignedValidly = false;
        }
      } else {
        allStopsAssignedValidly = false;
      }
    }
    const hasAssigned = allStopsAssignedValidly && assignedCount === remainingStops.length && assignedBuckets.every(b => b.length > 0);
    if (hasAssigned) {
      candidateSeeds.push(assignedBuckets);
    }

    let bestResult: any = null;
    let bestBuckets: any[][] = [];

    for (const seed of candidateSeeds) {
      let currentBuckets = seed.map(b => [...b]);
      let currentScore = scoreFleet(currentBuckets);

      let improved = true;
      let iters = 0;
      while (improved && iters < 80) {
        improved = false;
        iters++;
        for (let v1 = 0; v1 < fleetSize; v1++) {
          for (let v2 = 0; v2 < fleetSize; v2++) {
            if (v1 === v2) continue;

            const targetMinCount = Math.floor(remainingStops.length / fleetSize);
            const targetMaxCount = Math.ceil(remainingStops.length / fleetSize);
            if (currentBuckets[v1].length > targetMinCount &&
                currentBuckets[v2].length < targetMaxCount) {
              for (let i1 = 0; i1 < currentBuckets[v1].length; i1++) {
                const b1 = [...currentBuckets[v1]];
                const b2 = [...currentBuckets[v2]];
                const moved = b1.splice(i1, 1)[0];
                b2.push(moved);

                const testBuckets = currentBuckets.map((b, idx) => idx === v1 ? b1 : idx === v2 ? b2 : b);
                const evalRes = scoreFleet(testBuckets);
                if (evalRes.score < currentScore.score - 10) {
                  currentScore = evalRes;
                  currentBuckets = testBuckets;
                  improved = true;
                  break;
                }
              }
              if (improved) break;
            }

            for (let i1 = 0; i1 < currentBuckets[v1].length; i1++) {
              for (let i2 = 0; i2 < currentBuckets[v2].length; i2++) {
                const b1 = [...currentBuckets[v1]];
                const b2 = [...currentBuckets[v2]];
                const temp = b1[i1];
                b1[i1] = b2[i2];
                b2[i2] = temp;

                const testBuckets = currentBuckets.map((b, idx) => idx === v1 ? b1 : idx === v2 ? b2 : b);
                const evalRes = scoreFleet(testBuckets);
                if (evalRes.score < currentScore.score - 10) {
                  currentScore = evalRes;
                  currentBuckets = testBuckets;
                  improved = true;
                  break;
                }
              }
              if (improved) break;
            }
            if (improved) break;
          }
          if (improved) break;
        }
      }

      if (!bestResult || currentScore.score < bestResult.score) {
        bestResult = currentScore;
        bestBuckets = currentBuckets;
      }
    }

    const vehicleRoutes: any[] = [];
    const orderedAllStops: any[] = [stops[0]];

    for (let v = 0; v < fleetSize; v++) {
      const preset = isJohannesburgRegion ? JHB_VEHICLE_PRESETS[v] : undefined;
      const vanMeta = VAN_METAS[v] || { id: `van-${v + 1}`, label: `Vehicle 0${v + 1}`, color: '#3b82f6' };
      const vanDepot = resolveDepotForVehicle(v, stops[0]);
      const res = solveOptimalVanSequence(vanDepot, bestBuckets[v], depMin);
      const vanStops = res.orderedStops;

      const vanOrderedStops = [vanDepot, ...vanStops].map((s: any, idx: number) => ({
        ...s,
        assignedVanId: vanMeta.id,
        vanOrder: idx === 0 ? 0 : idx
      }));

      const hrs = Math.floor(res.eval.totalShiftMinutes / 60);
      const mins = res.eval.totalShiftMinutes % 60;
      const formattedShift = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

      vehicleRoutes.push({
        vehicleId: vanMeta.id,
        vehicleLabel: preset?.vehicleLabel || vanMeta.label,
        technicianName: preset?.technicianName,
        depotName: preset?.depotName,
        depotAddress: preset?.depotAddress,
        depotLocation: preset?.depotLocation,
        shiftSchedule: preset?.shiftSchedule || 'Mon–Fri 07:00–16:00',
        color: vanMeta.color,
        orderedStops: vanOrderedStops,
        stops: vanOrderedStops,
        legs: [],
        totalDistanceMeters: res.eval.drivingDistMeters,
        totalDurationSeconds: res.eval.drivingSecs,
        totalDurationMin: res.eval.drivingMin,
        formattedTotalDistance: `${(res.eval.drivingDistMeters / 1000).toFixed(1)} km`,
        formattedTotalDuration: `${res.eval.drivingMin} mins`,
        shiftDurationMinutes: res.eval.totalShiftMinutes,
        formattedShiftDuration: formattedShift,
        revenue: vanStops.reduce((acc: number, s: any) => acc + (s.serviceCost || 450), 0),
        appointmentCount: vanStops.length
      });

      vanStops.forEach((s: any, idx: number) => {
        orderedAllStops.push({
          ...s,
          assignedVanId: vanMeta.id,
          vanOrder: idx + 1
        });
      });
    }

    const totalDist = vehicleRoutes.reduce((acc, vr) => acc + vr.totalDistanceMeters, 0);
    const totalDur = vehicleRoutes.reduce((acc, vr) => acc + vr.totalDurationSeconds, 0);
    const maxShift = Math.max(...vehicleRoutes.map(vr => vr.shiftDurationMinutes));
    const maxShiftHrs = Math.floor(maxShift / 60);
    const maxShiftMins = maxShift % 60;

    return {
      solverUsed: 'Multi-Vehicle Fleet VRPTW',
      fleetSize,
      orderedStops: orderedAllStops,
      vehicleRoutes,
      totalDistanceMeters: totalDist,
      totalDurationSeconds: totalDur,
      maxShiftDurationMinutes: maxShift,
      formattedMaxShiftDuration: maxShiftHrs > 0 ? `${maxShiftHrs}h ${maxShiftMins}m` : `${maxShiftMins}m`
    };
  };

  try {
    const planResult = fallbackFleetPartition();
    const resultPayload = {
      ...planResult,
      solverUsed: 'Geographic Proximity Planner + Routes API',
      requestPayload: {
        stopsCount: stops.length,
        fleetSize,
        method: 'geographic-proximity-clustering',
        departureMinutes: depMin,
        timeZone: 'Africa/Johannesburg'
      },
      responsePayload: planResult
    };

    return res.json(resultPayload);
  } catch (error: any) {
    console.error('Geographic Proximity Planner error:', error);
    res.status(500).json({ error: error.message || 'Route planning error' });
  }
};

app.post('/api/routes/plan', handlePlanRoutes);
app.post('/api/routes/optimize', handlePlanRoutes);

// 5. Hamba Routes Dispatch Briefing
app.post('/api/ai/grooming-report', async (req, res) => {
  const { stops, totalDistance, totalDuration } = req.body;

  res.json({
    report: `🚐 **HAMBA ROUTES DISPATCH BRIEFING**\n\n` +
      `📍 **Route Scope:** ${stops?.length || 0} customer visits across ${totalDistance || '0 km'} (~${totalDuration || '0 mins'} drive time).\n\n` +
      `🧰 **Service Dispatch Mix:**\n` +
      `• **Pool Cleaning:** Chlorine shock, pH test kits, and leaf skimmers packed.\n` +
      `• **Pest Control:** Pet-safe perimeter spray, ant gel, and bait stations ready.\n` +
      `• **Garden Services:** Brushcutters, blowers, and green-waste bags loaded.\n\n` +
      `⚠️ **Johannesburg Field Notes:** Allow extra buffer at boomed estate gates and traffic lights during power outages.\n\n` +
      `🕒 **Shift Schedule:** Mon–Fri 07:00–16:00 SAST (Africa/Johannesburg)`
  });
});

// Vite middleware for development & static serving for production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(["/server.cjs", "/server.cjs.map"], (_req: any, res: any) => res.status(404).end());
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hamba Routes Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
