import { PetStop, RouteLeg, OptimizedRouteResult, MatrixCell } from '../types';
import {
  estimateDrivingDistance,
  estimateDrivingDuration,
  formatDistance,
  formatDuration,
  generateCurvedStreetPoints,
  densifyPolyline
} from './geoUtils';
import { FUNNY_HAZARDS, JHB_VEHICLES } from '../data/mockPetStops';

const LEG_COLORS = [
  '#38bdf8', // Sky blue
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#a855f7', // Purple
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#84cc16'  // Lime
];

/**
 * Builds pairwise distance & duration matrix
 */
export function buildDistanceMatrix(stops: PetStop[]): MatrixCell[][] {
  const matrix: MatrixCell[][] = [];
  for (let i = 0; i < stops.length; i++) {
    const row: MatrixCell[] = [];
    for (let j = 0; j < stops.length; j++) {
      if (i === j) {
        row.push({
          fromId: stops[i].id,
          toId: stops[j].id,
          distanceMeters: 0,
          durationSeconds: 0
        });
      } else {
        const dist = estimateDrivingDistance(stops[i].location, stops[j].location);
        const trafficFactor = 1.0 + (((i * 7 + j * 13) % 4) * 0.25); // 1.0x to 1.75x traffic delay
        const dur = Math.round(estimateDrivingDuration(dist) * trafficFactor);
        row.push({
          fromId: stops[i].id,
          toId: stops[j].id,
          distanceMeters: dist,
          durationSeconds: dur
        });
      }
    }
    matrix.push(row);
  }
  return matrix;
}



/**
 * Evaluates route distance and duration sequentially based on the current stops sequence order.
 */
export function calculateRouteResult(
  stops: PetStop[],
  overrideMatrix?: MatrixCell[][]
): OptimizedRouteResult {
  const matrix = overrideMatrix || buildDistanceMatrix(stops);
  const idToIndex = new Map<string, number>();
  stops.forEach((s, idx) => idToIndex.set(s.id, idx));

  const totalLegs = (stops.length > 1 && stops[0].id === 'depot') ? stops.length : stops.length - 1;
  const legs: RouteLeg[] = [];
  let totalDist = 0;
  let totalDur = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const fromStop = stops[i];
    const toStop = stops[i + 1];
    const fIdx = idToIndex.get(fromStop.id)!;
    const tIdx = idToIndex.get(toStop.id)!;

    const legDist = matrix[fIdx][tIdx].distanceMeters;
    const legDur = matrix[fIdx][tIdx].durationSeconds;

    totalDist += legDist;
    totalDur += legDur;

    const curvedCoords = densifyPolyline(generateCurvedStreetPoints(fromStop.location, toStop.location), 25, 60);
    const hazard = FUNNY_HAZARDS[(i * 3 + stops.length) % FUNNY_HAZARDS.length];

    legs.push({
      fromStopId: fromStop.id,
      toStopId: toStop.id,
      fromName: fromStop.name,
      toName: toStop.name,
      distanceMeters: legDist,
      distanceFormatted: formatDistance(legDist),
      durationSeconds: legDur,
      durationFormatted: formatDuration(legDur),
      pathCoordinates: curvedCoords,
      color: `hsl(${190 + Math.round(140 * (i / (totalLegs - 1)))}, ${90 + Math.round(10 * (i / (totalLegs - 1)))}%, ${70 - Math.round(25 * (i / (totalLegs - 1)))}%)`,
      funnyHazard: hazard
    });
  }

  // Return to Depot leg (closed loop)
  if (stops.length > 1 && stops[0].id === 'depot') {
    const fromStop = stops[stops.length - 1];
    const toStop = stops[0];
    const fIdx = idToIndex.get(fromStop.id)!;
    const tIdx = idToIndex.get(toStop.id)!;

    const legDist = matrix[fIdx][tIdx].distanceMeters;
    const legDur = matrix[fIdx][tIdx].durationSeconds;

    totalDist += legDist;
    totalDur += legDur;

    const curvedCoords = densifyPolyline(generateCurvedStreetPoints(fromStop.location, toStop.location), 25, 60);
    legs.push({
      fromStopId: fromStop.id,
      toStopId: toStop.id,
      fromName: fromStop.name,
      toName: `${toStop.name} (Return)`,
      distanceMeters: legDist,
      distanceFormatted: formatDistance(legDist),
      durationSeconds: legDur,
      durationFormatted: formatDuration(legDur),
      pathCoordinates: curvedCoords,
      color: `hsl(${190 + Math.round(140 * ((totalLegs - 1) / (totalLegs - 1)))}, ${90 + Math.round(10 * ((totalLegs - 1) / (totalLegs - 1)))}%, ${70 - Math.round(25 * ((totalLegs - 1) / (totalLegs - 1)))}%)`,
      funnyHazard: 'Returning to depot at end of shift'
    });
  }

  return {
    orderedStops: stops,
    legs,
    totalDistanceMeters: totalDist,
    totalDurationSeconds: totalDur,
    totalDurationMin: Math.round(totalDur / 60),
    formattedTotalDistance: formatDistance(totalDist),
    formattedTotalDuration: formatDuration(totalDur),
    initialDistanceMeters: totalDist,
    initialDurationSeconds: totalDur,
    distanceSavedMeters: 0,
    timeSavedMinutes: 0,
    percentOptimized: 0,
    matrix
  };
}

/**
 * Evaluates multi-van fleet route distance and duration sequentially partitioned across vans.
 */
/**
 * Clusters stops into spatially compact, contiguous geographic sectors.
 * Uses polar angular sweep around the center of mass, directional projections,
 * and compactness scoring to eliminate route intersections across vehicle groups
 * while keeping stops evenly balanced across vans.
 */
export function clusterStopsGeographically(stops: PetStop[], fleetSize: number): PetStop[][] {
  if (fleetSize <= 1 || stops.length <= 1) {
    return [stops];
  }

  const n = stops.length;
  const minCap = Math.floor(n / fleetSize);
  const remainder = n % fleetSize;

  const meanLat = stops.reduce((acc, s) => acc + s.location.lat, 0) / n;
  const meanLng = stops.reduce((acc, s) => acc + s.location.lng, 0) / n;

  const candidates: PetStop[][][] = [];

  // 1. Polar sweep around center of mass (evaluate all angular rotation cuts)
  const sortedPolar = [...stops].map(s => {
    const dy = s.location.lat - meanLat;
    const dx = (s.location.lng - meanLng) * Math.cos((meanLat * Math.PI) / 180);
    return { stop: s, angle: Math.atan2(dy, dx) };
  }).sort((a, b) => a.angle - b.angle);

  for (let cut = 0; cut < n; cut++) {
    const rotated = [...sortedPolar.slice(cut), ...sortedPolar.slice(0, cut)];
    const buckets: PetStop[][] = [];
    let offset = 0;
    for (let c = 0; c < fleetSize; c++) {
      const size = minCap + (c < remainder ? 1 : 0);
      buckets.push(rotated.slice(offset, offset + size).map(x => x.stop));
      offset += size;
    }
    candidates.push(buckets);
  }

  // 2. North-South sweep
  const sortedNS = [...stops].sort((a, b) => a.location.lat - b.location.lat);
  const nsBuckets: PetStop[][] = [];
  let nsOffset = 0;
  for (let c = 0; c < fleetSize; c++) {
    const size = minCap + (c < remainder ? 1 : 0);
    nsBuckets.push(sortedNS.slice(nsOffset, nsOffset + size));
    nsOffset += size;
  }
  candidates.push(nsBuckets);

  // 3. East-West sweep
  const sortedEW = [...stops].sort((a, b) => a.location.lng - b.location.lng);
  const ewBuckets: PetStop[][] = [];
  let ewOffset = 0;
  for (let c = 0; c < fleetSize; c++) {
    const size = minCap + (c < remainder ? 1 : 0);
    ewBuckets.push(sortedEW.slice(ewOffset, ewOffset + size));
    ewOffset += size;
  }
  candidates.push(ewBuckets);

  // Score candidate partitions to pick the one with lowest spatial dispersion and zero overlap
  let bestClusters = candidates[0];
  let bestScore = Infinity;

  for (const cand of candidates) {
    let dispersion = 0;
    let crossOverlapPenalty = 0;

    const centroids = cand.map(b => {
      if (b.length === 0) return { lat: meanLat, lng: meanLng };
      return {
        lat: b.reduce((sum, s) => sum + s.location.lat, 0) / b.length,
        lng: b.reduce((sum, s) => sum + s.location.lng, 0) / b.length
      };
    });

    for (let v = 0; v < cand.length; v++) {
      for (const s of cand[v]) {
        const myDist = estimateDrivingDistance(s.location, centroids[v]);
        dispersion += myDist;
        for (let u = 0; u < cand.length; u++) {
          if (u === v) continue;
          const otherDist = estimateDrivingDistance(s.location, centroids[u]);
          if (otherDist < myDist * 0.85) {
            crossOverlapPenalty += 1000000;
          }
        }
      }
    }

    const totalScore = crossOverlapPenalty + dispersion;
    if (totalScore < bestScore) {
      bestScore = totalScore;
      bestClusters = cand;
    }
  }

  return bestClusters;
}

export function calculateFleetRouteResult(
  stops: PetStop[],
  fleetSize: number = 3,
  overrideMatrix?: MatrixCell[][]
): OptimizedRouteResult {
  if (fleetSize <= 1) {
    return calculateRouteResult(stops, overrideMatrix);
  }

  const matrix = overrideMatrix || buildDistanceMatrix(stops);
  const depot = stops.find(s => s.id === 'depot') || stops[0];
  const pets = stops.filter(s => s.id !== 'depot');

  const VAN_COLORS = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
  const VAN_LABELS = ['Vehicle 01', 'Vehicle 02', 'Vehicle 03', 'Vehicle 04', 'Vehicle 05', 'Vehicle 06', 'Vehicle 07', 'Vehicle 08'];

  const vehicleRoutes: any[] = [];
  const allLegs: RouteLeg[] = [];
  let totalDist = 0;
  let totalDur = 0;

  const idToIndex = new Map<string, number>();
  stops.forEach((s, idx) => idToIndex.set(s.id, idx));

  const allPetsValidlyAssigned = pets.length > 0 && pets.every(p => {
    if (!p.assignedVanId || !p.assignedVanId.startsWith('van-')) return false;
    const vNum = parseInt(p.assignedVanId.replace('van-', ''), 10);
    return !isNaN(vNum) && vNum >= 1 && vNum <= fleetSize;
  });

  const vanBuckets = clusterStopsGeographically(pets, fleetSize);

  for (let v = 0; v < fleetSize; v++) {
    const vanId = `van-${v + 1}`;
    const vehiclePreset = JHB_VEHICLES[v];
    const vanLabel = vehiclePreset?.vehicleLabel || VAN_LABELS[v] || `Vehicle 0${v + 1}`;
    const vanColor = vehiclePreset?.color || VAN_COLORS[v] || '#3b82f6';
    const vanDepot: PetStop = vehiclePreset
      ? {
          ...depot,
          name: vehiclePreset.depotName,
          address: vehiclePreset.depotAddress,
          location: vehiclePreset.depotLocation,
          ownerName: vehiclePreset.technicianName
        }
      : depot;

    let vanPets: PetStop[];

    if (allPetsValidlyAssigned) {
      vanPets = pets
        .filter(p => p.assignedVanId === vanId)
        .sort((a, b) => (a.vanOrder || a.order || 0) - (b.vanOrder || b.order || 0));
    } else {
      vanPets = (vanBuckets[v] || []).map((p, pIdx) => ({
        ...p,
        assignedVanId: vanId,
        vanOrder: pIdx + 1
      }));
    }

    const vanStops = [vanDepot, ...vanPets];
    const vanLegs: RouteLeg[] = [];
    let vanDist = 0;
    let vanDur = 0;

    for (let i = 0; i < vanStops.length - 1; i++) {
      const fromStop = vanStops[i];
      const toStop = vanStops[i + 1];
      const fIdx = idToIndex.get(fromStop.id);
      const tIdx = idToIndex.get(toStop.id);
      const involvesCustomDepot = (fromStop.id === 'depot' || toStop.id === 'depot') && Boolean(vehiclePreset);

      const legDist = (!involvesCustomDepot && fIdx !== undefined && tIdx !== undefined && matrix[fIdx] && matrix[fIdx][tIdx])
        ? matrix[fIdx][tIdx].distanceMeters
        : estimateDrivingDistance(fromStop.location, toStop.location);
      const legDur = (!involvesCustomDepot && fIdx !== undefined && tIdx !== undefined && matrix[fIdx] && matrix[fIdx][tIdx])
        ? matrix[fIdx][tIdx].durationSeconds
        : estimateDrivingDuration(legDist);
      vanDist += legDist;
      vanDur += legDur;

      const curvedCoords = densifyPolyline(generateCurvedStreetPoints(fromStop.location, toStop.location), 25, 60);
      const leg: RouteLeg = {
        fromStopId: fromStop.id,
        toStopId: toStop.id,
        fromName: fromStop.name,
        toName: toStop.name,
        distanceMeters: legDist,
        distanceFormatted: formatDistance(legDist),
        durationSeconds: legDur,
        durationFormatted: formatDuration(legDur),
        pathCoordinates: curvedCoords,
        color: vanColor,
        vanId,
        vanLabel
      };
      vanLegs.push(leg);
      allLegs.push(leg);
    }

    // Return to depot leg
    if (vanStops.length > 1) {
      const fromStop = vanStops[vanStops.length - 1];
      const toStop = vanDepot;
      const fIdx = idToIndex.get(fromStop.id);
      const tIdx = idToIndex.get(toStop.id);
      const involvesCustomDepot = Boolean(vehiclePreset);

      const legDist = (!involvesCustomDepot && fIdx !== undefined && tIdx !== undefined && matrix[fIdx] && matrix[fIdx][tIdx])
        ? matrix[fIdx][tIdx].distanceMeters
        : estimateDrivingDistance(fromStop.location, toStop.location);
      const legDur = (!involvesCustomDepot && fIdx !== undefined && tIdx !== undefined && matrix[fIdx] && matrix[fIdx][tIdx])
        ? matrix[fIdx][tIdx].durationSeconds
        : estimateDrivingDuration(legDist);
      vanDist += legDist;
      vanDur += legDur;

      const curvedCoords = densifyPolyline(generateCurvedStreetPoints(fromStop.location, toStop.location), 25, 60);
      const leg: RouteLeg = {
        fromStopId: fromStop.id,
        toStopId: toStop.id,
        fromName: fromStop.name,
        toName: `${toStop.name} (Return)`,
        distanceMeters: legDist,
        distanceFormatted: formatDistance(legDist),
        durationSeconds: legDur,
        durationFormatted: formatDuration(legDur),
        pathCoordinates: curvedCoords,
        color: vanColor,
        vanId,
        vanLabel
      };
      vanLegs.push(leg);
      allLegs.push(leg);
    }

    totalDist += vanDist;
    totalDur += vanDur;

    const totalServiceMin = vanPets.reduce((acc, p) => acc + (p.durationMin || 25), 0);
    const shiftMin = Math.round(vanDur / 60) + totalServiceMin;
    const shiftHrs = Math.floor(shiftMin / 60);
    const shiftRemainMins = shiftMin % 60;

    vehicleRoutes.push({
      vehicleId: vanId,
      vehicleLabel: vanLabel,
      technicianName: vehiclePreset?.technicianName || `Technician ${v + 1}`,
      depotName: vehiclePreset?.depotName || 'Johannesburg Depot',
      depotAddress: vehiclePreset?.depotAddress || depot.address,
      depotLocation: vehiclePreset?.depotLocation || depot.location,
      shiftSchedule: 'Mon–Fri 07:00–16:00',
      color: vanColor,
      orderedStops: vanStops,
      stops: vanStops,
      legs: vanLegs,
      totalDistanceMeters: vanDist,
      totalDurationSeconds: vanDur,
      totalDurationMin: Math.round(vanDur / 60),
      formattedTotalDistance: formatDistance(vanDist),
      formattedTotalDuration: formatDuration(vanDur),
      shiftDurationMinutes: shiftMin,
      formattedShiftDuration: shiftHrs > 0 ? `${shiftHrs}h ${shiftRemainMins}m` : `${shiftRemainMins}m`,
      appointmentCount: vanPets.length,
      revenue: vanPets.reduce((acc, p) => acc + (p.serviceCost || 450), 0)
    });
  }

  const taggedStops = [
    depot,
    ...vehicleRoutes.flatMap(vr => vr.stops.filter((s: PetStop) => s.id !== 'depot'))
  ];

  return {
    orderedStops: taggedStops,
    legs: allLegs,
    vehicleRoutes,
    totalDistanceMeters: totalDist,
    totalDurationSeconds: totalDur,
    totalDurationMin: Math.round(totalDur / 60),
    formattedTotalDistance: formatDistance(totalDist),
    formattedTotalDuration: formatDuration(totalDur),
    initialDistanceMeters: totalDist,
    initialDurationSeconds: totalDur,
    distanceSavedMeters: 0,
    timeSavedMinutes: 0,
    percentOptimized: 0,
    matrix
  };
}

export interface RouteTimelineLeg {
  legIndex: number;
  fromStopId: string;
  toStopId: string;
  startDriveMinutes: number;
  arrivalMinutes: number;
  driveDurationMinutes: number;
  waitDurationMinutes: number;
  serviceDurationMinutes: number;
  departureMinutes: number;
}

export interface RouteValidation {
  arrivalTimes: string[];
  violationsCount: number;
  violatedStopIds: string[];
  totalShiftMinutes: number;
  totalWaitMinutes: number;
  formattedShiftDuration: string;
  returnTime?: string;
  timelineLegs: RouteTimelineLeg[];
}

export function validateTimeWindows(stops: PetStop[], legs: RouteLeg[], departureMinutes: number = 420): RouteValidation {
  if (departureMinutes === undefined || departureMinutes === null || isNaN(departureMinutes)) {
    return {
      arrivalTimes: stops.map(() => '--:--'),
      violationsCount: 0,
      violatedStopIds: [],
      totalShiftMinutes: 0,
      totalWaitMinutes: 0,
      formattedShiftDuration: '--',
      returnTime: '--:--',
      timelineLegs: []
    };
  }

  const arrivalTimes: string[] = [];
  const violatedStopIds: string[] = [];
  const timelineLegs: RouteTimelineLeg[] = [];
  let currentMinutes = departureMinutes;
  let accumulatedWaitMinutes = 0;

  const startHrs = Math.floor(departureMinutes / 60) % 24;
  const startMins = Math.floor(departureMinutes % 60);
  const startDisplayHrs = String(startHrs).padStart(2, '0');
  const startDisplayMins = String(startMins).padStart(2, '0');
  arrivalTimes.push(`${startDisplayHrs}:${startDisplayMins}`);

  for (let i = 0; i < stops.length - 1; i++) {
    const currentStop = stops[i];
    const nextStop = stops[i + 1];
    const leg = legs[i];

    const startDrive = currentMinutes;
    const travelTimeMin = leg
      ? Math.max(1, Math.round(leg.durationSeconds / 60))
      : Math.max(2, Math.round(estimateDrivingDuration(estimateDrivingDistance(currentStop.location, nextStop.location)) / 60));
    const arrivalMin = startDrive + travelTimeMin;
    
    const hrs = Math.floor(arrivalMin / 60) % 24;
    const mins = Math.floor(arrivalMin % 60);
    const displayHrs = String(hrs).padStart(2, '0');
    const displayMins = String(mins).padStart(2, '0');
    arrivalTimes.push(`${displayHrs}:${displayMins}`);

    let waitMin = 0;
    // Check time window violation and wait time
    if (nextStop.id !== 'depot' && nextStop.timeWindow) {
      const [wStartHrs, wStartMins] = nextStop.timeWindow.start.split(':').map(Number);
      const [wEndHrs, wEndMins] = nextStop.timeWindow.end.split(':').map(Number);
      const windowStartMin = wStartHrs * 60 + wStartMins;
      const windowEndMin = wEndHrs * 60 + wEndMins;

      if (arrivalMin > windowEndMin) {
        violatedStopIds.push(nextStop.id);
      }
      if (arrivalMin < windowStartMin) {
        waitMin = windowStartMin - arrivalMin;
        accumulatedWaitMinutes += waitMin;
      }
    }

    const serviceDuration = nextStop.id === 'depot' ? 0 : (nextStop.durationMin || 25);
    const serviceEnd = arrivalMin + waitMin + serviceDuration;

    timelineLegs.push({
      legIndex: i,
      fromStopId: currentStop.id,
      toStopId: nextStop.id,
      startDriveMinutes: startDrive,
      arrivalMinutes: arrivalMin,
      driveDurationMinutes: travelTimeMin,
      waitDurationMinutes: waitMin,
      serviceDurationMinutes: serviceDuration,
      departureMinutes: serviceEnd
    });

    currentMinutes = serviceEnd;
  }

  // Ensure final return leg to depot is accounted for
  const lastStop = stops[stops.length - 1];
  const depotStop = stops[0];
  if (lastStop && lastStop.id !== 'depot' && depotStop) {
    const returnLegIndex = legs.length > stops.length - 1 ? stops.length - 1 : legs.length;
    const returnLeg = legs[returnLegIndex];
    const startDrive = currentMinutes;
    const returnTravelMin = returnLeg
      ? Math.max(1, Math.round(returnLeg.durationSeconds / 60))
      : Math.max(2, Math.round(estimateDrivingDuration(estimateDrivingDistance(lastStop.location, depotStop.location)) / 60));
    const finalArrival = startDrive + returnTravelMin;

    timelineLegs.push({
      legIndex: timelineLegs.length,
      fromStopId: lastStop.id,
      toStopId: depotStop.id,
      startDriveMinutes: startDrive,
      arrivalMinutes: finalArrival,
      driveDurationMinutes: returnTravelMin,
      waitDurationMinutes: 0,
      serviceDurationMinutes: 0,
      departureMinutes: finalArrival
    });
    currentMinutes = finalArrival;
  }

  const finalReturnMinutes = currentMinutes;
  const totalShiftMinutes = Math.max(0, finalReturnMinutes - departureMinutes);
  const shiftHrs = Math.floor(totalShiftMinutes / 60);
  const shiftMins = Math.round(totalShiftMinutes % 60);
  const formattedShiftDuration = isNaN(shiftHrs) || isNaN(shiftMins) 
    ? '--' 
    : shiftHrs > 0 
      ? `${shiftHrs}h${shiftMins > 0 ? ` ${shiftMins}m` : ''}` 
      : `${shiftMins}m`;

  let returnTime = '--:--';
  if (!isNaN(finalReturnMinutes)) {
    const returnHrs = Math.floor(finalReturnMinutes / 60) % 24;
    const returnMins = Math.floor(finalReturnMinutes % 60);
    const returnDisplayHrs = returnHrs < 10 ? `0${returnHrs}` : `${returnHrs}`;
    const returnDisplayMins = returnMins < 10 ? `0${returnMins}` : `${returnMins}`;
    returnTime = `${returnDisplayHrs}:${returnDisplayMins}`;
  }

  return {
    arrivalTimes,
    violationsCount: violatedStopIds.length,
    violatedStopIds,
    totalShiftMinutes,
    totalWaitMinutes: accumulatedWaitMinutes,
    formattedShiftDuration,
    returnTime,
    timelineLegs
  };
}

export interface StopValidationInfo {
  estimatedArrival: string;
  isViolated: boolean;
  hasWait: boolean;
  waitMinutes: number;
  timelineLeg?: RouteTimelineLeg;
}

export interface FleetValidation {
  totalViolations: number;
  violationsCount?: number;
  totalWaitMinutes: number;
  maxShiftMinutes: number;
  formattedMaxShift: string;
  vanValidations: Record<string, RouteValidation>;
  stopValidationMap: Record<string, StopValidationInfo>;
}

export function validateFleet(
  vehicleRoutes: any[],
  departureMinutes: number = 420
): FleetValidation {
  const vanValidations: Record<string, RouteValidation> = {};
  const stopValidationMap: Record<string, StopValidationInfo> = {};
  let totalViolations = 0;
  let totalWaitMinutes = 0;
  let maxShiftMinutes = 0;

  vehicleRoutes.forEach((vr, idx) => {
    const vStops = vr.stops || vr.orderedStops || [];
    const vLegs = vr.legs || [];
    const val = validateTimeWindows(vStops, vLegs, departureMinutes);
    if (vr.vehicleId) vanValidations[vr.vehicleId] = val;
    vanValidations[`van-${idx + 1}`] = val;
    vanValidations[`van-0${idx + 1}`] = val;
    vanValidations[`van-${String(idx + 1).padStart(2, '0')}`] = val;

    totalViolations += val.violationsCount;
    totalWaitMinutes += val.totalWaitMinutes;
    if (val.totalShiftMinutes > maxShiftMinutes) {
      maxShiftMinutes = val.totalShiftMinutes;
    }

    // Map each appointment stop in this van's route
    vStops.forEach((stop: PetStop, idx: number) => {
      if (stop.id === 'depot') return;
      const arrival = val.arrivalTimes[idx] || '--:--';
      const isViolated = val.violatedStopIds.includes(stop.id);
      const leg = val.timelineLegs[idx - 1];
      const waitMin = leg?.waitDurationMinutes || 0;
      stopValidationMap[stop.id] = {
        estimatedArrival: arrival,
        isViolated,
        hasWait: waitMin > 0,
        waitMinutes: waitMin,
        timelineLeg: leg
      };
    });
  });

  const shiftHrs = Math.floor(maxShiftMinutes / 60);
  const shiftMins = Math.round(maxShiftMinutes % 60);

  return {
    totalViolations,
    violationsCount: totalViolations,
    totalWaitMinutes,
    maxShiftMinutes,
    formattedMaxShift: isNaN(shiftHrs) || isNaN(shiftMins)
      ? '--'
      : shiftHrs > 0
      ? `${shiftHrs}h${shiftMins > 0 ? ` ${shiftMins}m` : ''}`
      : `${shiftMins}m`,
    vanValidations,
    stopValidationMap
  };
}

