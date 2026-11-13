import { CITY_PRESETS } from './src/data/mockPetStops';
import { validateTimeWindows, calculateRouteResult } from './src/utils/tspSolver';

const sf = CITY_PRESETS[0];

const depot = {
  id: 'depot',
  order: 0,
  name: 'Bark & Ride Headquarters',
  ownerName: 'HQ Operations',
  breed: 'Base Camp Depot',
  species: 'dog' as any,
  avatar: '🏢',
  address: sf.name,
  location: sf.center,
  serviceType: 'HQ Base Depot',
  serviceCost: 0,
  personality: 'Base Camp',
  urgency: 'standard' as any,
  mudLevel: 0,
  fluffFactor: 0,
  timeWindow: { start: '08:00', end: '20:00' },
  durationMin: 0,
  specialInstructions: 'Starting & Ending base camp',
  status: 'pending' as any,
  funnyQuote: 'Base'
};

const baselineStops = [depot, ...sf.stops];

interface RowData {
  name: string;
  dist: string;
  driving: string;
  shift: string;
  windows: string;
  saved: string;
  rawDistance: number;
  rawDuration: number;
}

async function evaluateSequence(stops: any[], isBaseline: boolean = false, baselineStats?: { dist: number; dur: number }): Promise<RowData> {
  // Call local express proxy to get real street routing legs
  const res = await fetch('http://localhost:3000/api/routes/compute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: stops[0].location,
      destination: stops[0].location,
      intermediates: stops.slice(1).map(s => s.location)
    })
  });

  if (!res.ok) {
    throw new Error(`Routes API compute failed: ${res.status}`);
  }

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route || !route.legs) {
    throw new Error("No legs returned from Routes API");
  }

  // Parse legs
  const realLegs = route.legs.map((leg: any, idx: number) => ({
    fromStopId: stops[idx].id,
    toStopId: stops[(idx + 1) % stops.length].id,
    distanceMeters: leg.distanceMeters || 1500,
    durationSeconds: leg.duration ? parseInt(leg.duration.replace('s', '')) : 360
  }));

  // Validate time windows
  const validation = validateTimeWindows(stops, realLegs);

  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  realLegs.forEach((leg: any) => {
    totalDistanceMeters += leg.distanceMeters;
    totalDurationSeconds += leg.durationSeconds;
  });

  const formattedDistance = (totalDistanceMeters / 1000).toFixed(1) + ' km';
  
  const driveHrs = Math.floor(totalDurationSeconds / 3600);
  const driveMins = Math.round((totalDurationSeconds % 3600) / 60);
  const formattedDriving = driveHrs > 0 ? `${driveHrs}h ${driveMins}m` : `${driveMins}m`;

  let savedStr = '—';
  if (!isBaseline && baselineStats) {
    const distSaved = (baselineStats.dist - totalDistanceMeters) / 1000;
    const timeSaved = Math.round((baselineStats.dur - totalDurationSeconds) / 60);
    
    const distSavedPart = distSaved >= 0.1 ? `↓${distSaved.toFixed(1)}km` : '0';
    const timeSavedPart = timeSaved >= 1 ? `↓${timeSaved}m` : '0';
    savedStr = distSavedPart !== '0' || timeSavedPart !== '0' 
      ? `${distSavedPart} / ${timeSavedPart}` 
      : '0';
  }

  return {
    name: isBaseline ? 'Manual route' : '',
    dist: formattedDistance,
    driving: formattedDriving,
    shift: validation.formattedShiftDuration,
    windows: validation.violationsCount === 0 ? '✅ Met' : `⚠️ ${validation.violationsCount} Late`,
    saved: isBaseline ? 'Baseline' : savedStr,
    rawDistance: totalDistanceMeters,
    rawDuration: totalDurationSeconds
  };
}

async function optimizeGoal(goal: 'time' | 'distance' | 'balanced', label: string, baselineStats: { dist: number; dur: number }): Promise<RowData> {
  const res = await fetch('http://localhost:3000/api/routes/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stops: baselineStops,
      keepFirstAsOrigin: true,
      optimizationMode: goal
    })
  });

  if (!res.ok) {
    throw new Error(`Optimization failed: ${res.status}`);
  }

  const data = await res.json();
  if (!data.orderedStops) {
    throw new Error(`Optimization returned empty result: ${data.error || 'Unknown'}`);
  }
  console.log(`[${label}] Sequence:`, data.orderedStops.map((s: any) => s.name));

  const evaluated = await evaluateSequence(data.orderedStops, false, baselineStats);
  evaluated.name = label;
  return evaluated;
}

function printTable(rows: RowData[]) {
  console.log("\n=========================================================================================");
  console.log("                           ROUTE OPTIMIZATION COMPARATIVE REPORT                          ");
  console.log("=========================================================================================");
  console.log("+--------------------+--------------+------------+-------------+---------------+--------------------+");
  console.log("| GOAL / RUN         | DISTANCE     | DRIVING    | TOTAL SHIFT | TIME WINDOWS  | SAVED (DIST/TIME)  |");
  console.log("+--------------------+--------------+------------+-------------+---------------+--------------------+");
  rows.forEach(r => {
    const goal = r.name.padEnd(18);
    const dist = r.dist.padEnd(12);
    const driving = r.driving.padEnd(10);
    const shift = r.shift.padEnd(11);
    const windows = r.windows.padEnd(13);
    const saved = r.saved.padEnd(18);
    console.log(`| ${goal} | ${dist} | ${driving} | ${shift} | ${windows} | ${saved} |`);
  });
  console.log("+--------------------+--------------+------------+-------------+---------------+--------------------+");
  console.log("* Note: Total Shift represents departure from Depot at 08:00 AM to return, including grooming & waits.");
  console.log("=========================================================================================\n");
}

async function run() {
  console.log("Evaluating baseline sequence of San Francisco stops...");
  try {
    const baseline = await evaluateSequence(baselineStops, true);
    
    console.log("Querying optimizer API for Shortest Distance...");
    const distance = await optimizeGoal('distance', 'Shortest Distance', { dist: baseline.rawDistance, dur: baseline.rawDuration });
    
    console.log("Querying optimizer API for Fastest Time...");
    const time = await optimizeGoal('time', 'Fastest Time', { dist: baseline.rawDistance, dur: baseline.rawDuration });
    
    console.log("Querying optimizer API for Balanced...");
    const balanced = await optimizeGoal('balanced', 'Balanced', { dist: baseline.rawDistance, dur: baseline.rawDuration });

    printTable([baseline, distance, time, balanced]);
  } catch (e: any) {
    console.error("Coherence test failed:", e.message);
  }
}

run();
