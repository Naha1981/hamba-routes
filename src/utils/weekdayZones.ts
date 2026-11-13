import {
  PetStop,
  RouteLeg,
  LatLng,
  Weekday,
  WEEKDAYS,
  WEEKDAY_COLORS,
  DayVehicleRoute,
  DaySummary,
  WeekSchedulePlan,
  FuelSettings,
  PlacementOption,
  MatrixPairResult
} from '../types';
import {
  estimateDrivingDistance,
  estimateDrivingDuration,
  formatDistance,
  formatDuration,
  generateCurvedStreetPoints,
  densifyPolyline
} from './geoUtils';
import { clusterStopsGeographically, validateTimeWindows } from './tspSolver';
import { JHB_VEHICLES } from '../data/mockPetStops';

const DEFAULT_DEPOT: LatLng = { lat: -26.1076, lng: 28.0567, altitude: 1500 };

function getVehiclePreset(vIdx: number, fallbackDepot?: PetStop) {
  const preset = JHB_VEHICLES[vIdx];
  if (preset) {
    return {
      vehicleId: preset.vehicleId,
      vehicleLabel: preset.vehicleLabel,
      technicianName: preset.technicianName,
      depotName: preset.depotName,
      depotAddress: preset.depotAddress,
      depotLocation: preset.depotLocation
    };
  }
  return {
    vehicleId: `van-${vIdx + 1}`,
    vehicleLabel: `Vehicle ${vIdx + 1 < 10 ? `0${vIdx + 1}` : vIdx + 1}`,
    technicianName: `Technician ${vIdx + 1}`,
    depotName: fallbackDepot?.name || 'Johannesburg Depot',
    depotAddress: fallbackDepot?.address || 'Sandton, Johannesburg',
    depotLocation: fallbackDepot?.location || DEFAULT_DEPOT
  };
}

function makeDepotStop(vIdx: number, baseDepot?: PetStop): PetStop {
  const meta = getVehiclePreset(vIdx, baseDepot);
  return {
    id: `depot-${meta.vehicleId}`,
    order: 0,
    name: meta.depotName,
    ownerName: meta.technicianName,
    breed: 'Depot Base',
    species: 'dog',
    avatar: '🏢',
    address: meta.depotAddress,
    location: meta.depotLocation,
    serviceType: 'Dispatch Depot',
    serviceCost: 0,
    personality: 'Mon–Fri 07:00–16:00 SAST',
    urgency: 'standard',
    mudLevel: 0,
    fluffFactor: 0,
    timeWindow: { start: '07:00', end: '16:00' },
    durationMin: 0,
    specialInstructions: 'Starting & ending depot',
    funnyQuote: `${meta.depotName} · ${meta.technicianName}`,
    status: 'completed',
    isPinned: true
  };
}

function tourDistance(depotLoc: LatLng, visits: PetStop[]): number {
  if (visits.length === 0) return 0;
  let dist = estimateDrivingDistance(depotLoc, visits[0].location);
  for (let i = 0; i < visits.length - 1; i++) {
    dist += estimateDrivingDistance(visits[i].location, visits[i + 1].location);
  }
  dist += estimateDrivingDistance(visits[visits.length - 1].location, depotLoc);
  return dist;
}

/**
 * Optimizes visit order for a single (weekday, vehicle) tour from & returning to depot.
 */
export function optimizeTourSequence(depotLoc: LatLng, visits: PetStop[]): PetStop[] {
  if (visits.length <= 1) return [...visits];

  if (visits.length <= 7) {
    // Exact permutation search for <= 7 stops
    let bestOrder = [...visits];
    let bestDist = Infinity;

    const permute = (arr: PetStop[], start: number) => {
      if (start === arr.length - 1) {
        const d = tourDistance(depotLoc, arr);
        if (d < bestDist) {
          bestDist = d;
          bestOrder = [...arr];
        }
        return;
      }
      for (let i = start; i < arr.length; i++) {
        [arr[start], arr[i]] = [arr[i], arr[start]];
        permute(arr, start + 1);
        [arr[start], arr[i]] = [arr[i], arr[start]];
      }
    };

    permute([...visits], 0);
    return bestOrder;
  }

  // Nearest-neighbor seed + 2-opt refinement for 8+ stops
  const remaining = [...visits];
  const tour: PetStop[] = [];
  let curLoc = depotLoc;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = estimateDrivingDistance(curLoc, remaining[i].location);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    tour.push(next);
    curLoc = next.location;
  }

  let improved = true;
  let iters = 0;
  let currentDist = tourDistance(depotLoc, tour);
  while (improved && iters < 40) {
    improved = false;
    iters++;
    for (let i = 0; i < tour.length - 1; i++) {
      for (let k = i + 1; k < tour.length; k++) {
        const candidate = [...tour];
        const seg = candidate.slice(i, k + 1).reverse();
        candidate.splice(i, k - i + 1, ...seg);
        const candDist = tourDistance(depotLoc, candidate);
        if (candDist < currentDist - 5) {
          currentDist = candDist;
          tour.splice(0, tour.length, ...candidate);
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return tour;
}

/**
 * Estimates total shift duration in minutes (driving + service + return leg) for a tour.
 */
function estimateTourMetrics(depotLoc: LatLng, orderedVisits: PetStop[], departureMinutes: number) {
  if (orderedVisits.length === 0) {
    return {
      totalDist: 0,
      totalDurSec: 0,
      driveMin: 0,
      serviceMin: 0,
      shiftMin: 0,
      returnTime: `${String(Math.floor(departureMinutes / 60)).padStart(2, '0')}:${String(departureMinutes % 60).padStart(2, '0')}`
    };
  }

  let totalDist = 0;
  let totalDurSec = 0;
  let serviceMin = 0;

  let prevLoc = depotLoc;
  for (const visit of orderedVisits) {
    const dist = estimateDrivingDistance(prevLoc, visit.location);
    const durSec = estimateDrivingDuration(dist);
    totalDist += dist;
    totalDurSec += durSec;
    serviceMin += visit.durationMin || 25;
    prevLoc = visit.location;
  }

  // Return to depot
  const retDist = estimateDrivingDistance(prevLoc, depotLoc);
  const retSec = estimateDrivingDuration(retDist);
  totalDist += retDist;
  totalDurSec += retSec;

  const driveMin = Math.max(orderedVisits.length > 0 ? 1 : 0, Math.round(totalDurSec / 60));
  const shiftMin = driveMin + serviceMin;
  const endMin = departureMinutes + shiftMin;
  const endHrs = Math.floor(endMin / 60) % 24;
  const endMins = Math.round(endMin % 60);
  const returnTime = `${String(endHrs).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

  return { totalDist, totalDurSec, driveMin, serviceMin, shiftMin, returnTime };
}

/**
 * Assigns every customer to a Weekday (Monday–Friday) and Vehicle (van-1..van-N)
 * so each weekday forms a tight geographic zone, respecting shift hours and visit lengths.
 */
export function assignWeekdayZones(
  allStops: PetStop[],
  fleetSize: number = 3,
  departureMinutes: number = 420,
  maxShiftMinutes: number = 540,
  preserveManualDays: boolean = false
): { updatedStops: PetStop[]; weekPlan: WeekSchedulePlan } {
  const depotBase = allStops.find(s => s.id === 'depot') || allStops[0];
  const customers = allStops.filter(s => s.id !== 'depot');
  const safeFleet = Math.max(1, Math.min(8, fleetSize));

  if (customers.length === 0) {
    const emptyPlan = buildWeekSchedulePlan(allStops, safeFleet, departureMinutes, maxShiftMinutes);
    return { updatedStops: allStops, weekPlan: emptyPlan };
  }

  // Step 1: Assign weekdays geographically across Mon–Fri (5 weekday clusters)
  const needsAutoWeekday = !preserveManualDays || customers.some(c => !c.assignedWeekday);
  let dayBuckets: Record<Weekday, PetStop[]> = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: []
  };

  if (needsAutoWeekday) {
    // Cluster all customers into 5 compact geographic weekday sectors
    const numDays = Math.min(5, Math.max(1, customers.length));
    const clusters = clusterStopsGeographically(customers, numDays);

    // Order clusters cleanly NW -> NE -> Central -> SW -> SE or by centroid longitude/latitude
    const clusterCentroids = clusters.map((bucket, idx) => {
      const avgLat = bucket.reduce((sum, s) => sum + s.location.lat, 0) / Math.max(1, bucket.length);
      const avgLng = bucket.reduce((sum, s) => sum + s.location.lng, 0) / Math.max(1, bucket.length);
      return { idx, bucket, avgLat, avgLng };
    });
    // Stable geographic sweep ordering (west-to-east with slight north-south tiebreak) so Mon..Fri walk cleanly across the city
    clusterCentroids.sort((a, b) => (a.avgLng - b.avgLng) + (b.avgLat - a.avgLat) * 0.4);

    clusterCentroids.forEach((entry, dayIdx) => {
      const weekday = WEEKDAYS[dayIdx % 5];
      dayBuckets[weekday].push(...entry.bucket);
    });

    // Respect shift capacity across days: total daily fleet visit+drive capacity = safeFleet * maxShiftMinutes
    const dailyMaxTotalMinutes = safeFleet * maxShiftMinutes * 0.92;
    const estimateDayMinutes = (bucket: PetStop[]) =>
      bucket.reduce((sum, s) => sum + (s.durationMin || 25) + 8, 0) + safeFleet * 20;

    // Rebalance any overloaded day to the geographically nearest under-capacity weekday
    let rebalanced = true;
    let guard = 0;
    while (rebalanced && guard < 20) {
      rebalanced = false;
      guard++;
      for (const day of WEEKDAYS) {
        if (estimateDayMinutes(dayBuckets[day]) > dailyMaxTotalMinutes && dayBuckets[day].length > 1) {
          // Find customer farthest from this day's centroid and move to nearest day with headroom
          const dStops = dayBuckets[day];
          const cLat = dStops.reduce((s, p) => s + p.location.lat, 0) / dStops.length;
          const cLng = dStops.reduce((s, p) => s + p.location.lng, 0) / dStops.length;

          // Sort stops by distance from centroid descending
          let moveStop = dStops[0];
          let maxDist = -1;
          for (const st of dStops) {
            const d = estimateDrivingDistance(st.location, { lat: cLat, lng: cLng });
            if (d > maxDist) {
              maxDist = d;
              moveStop = st;
            }
          }

          let targetDay: Weekday | null = null;
          let minTargetDist = Infinity;
          for (const candDay of WEEKDAYS) {
            if (candDay === day) continue;
            const candBucket = dayBuckets[candDay];
            if (estimateDayMinutes(candBucket) + (moveStop.durationMin || 25) + 10 <= dailyMaxTotalMinutes) {
              const tLat = candBucket.length > 0
                ? candBucket.reduce((s, p) => s + p.location.lat, 0) / candBucket.length
                : cLat;
              const tLng = candBucket.length > 0
                ? candBucket.reduce((s, p) => s + p.location.lng, 0) / candBucket.length
                : cLng;
              const distToDay = estimateDrivingDistance(moveStop.location, { lat: tLat, lng: tLng });
              if (distToDay < minTargetDist) {
                minTargetDist = distToDay;
                targetDay = candDay;
              }
            }
          }

          if (targetDay) {
            dayBuckets[day] = dayBuckets[day].filter(s => s.id !== moveStop.id);
            dayBuckets[targetDay].push(moveStop);
            rebalanced = true;
            break;
          }
        }
      }
    }
  } else {
    customers.forEach(c => {
      const day = c.assignedWeekday && WEEKDAYS.includes(c.assignedWeekday) ? c.assignedWeekday : 'Monday';
      dayBuckets[day].push(c);
    });
  }

  // Step 2: Within each weekday, assign stops to vehicles (nearest depot / spatial balance + shift length check)
  const assignedCustomersMap = new Map<string, PetStop>();

  WEEKDAYS.forEach((day) => {
    const dayStops = dayBuckets[day];
    if (dayStops.length === 0) return;

    const vehicleBuckets: PetStop[][] = Array.from({ length: safeFleet }, () => []);

    if (safeFleet === 1) {
      vehicleBuckets[0] = [...dayStops];
    } else if (preserveManualDays && dayStops.every(s => {
      if (!s.assignedVanId || !s.assignedVanId.startsWith('van-')) return false;
      const vNum = parseInt(s.assignedVanId.replace('van-', ''), 10);
      return !isNaN(vNum) && vNum >= 1 && vNum <= safeFleet;
    })) {
      dayStops.forEach(s => {
        const vIdx = Math.max(0, Math.min(safeFleet - 1, parseInt(s.assignedVanId!.replace('van-', ''), 10) - 1));
        vehicleBuckets[vIdx].push(s);
      });
    } else {
      // Cluster day's stops into up to safeFleet sub-clusters, then match each sub-cluster to nearest vehicle depot
      const activeCount = Math.min(safeFleet, dayStops.length);
      const rawClusters = clusterStopsGeographically(dayStops, activeCount);

      // Compute centroids and match each cluster greedily to the closest unused vehicle depot
      const clusterMeta = rawClusters.map((cStops, idx) => ({
        idx,
        stops: cStops,
        centroid: {
          lat: cStops.reduce((s, p) => s + p.location.lat, 0) / Math.max(1, cStops.length),
          lng: cStops.reduce((s, p) => s + p.location.lng, 0) / Math.max(1, cStops.length)
        }
      }));

      const usedVehicles = new Set<number>();
      clusterMeta.forEach((cm) => {
        let bestV = 0;
        let bestDist = Infinity;
        for (let v = 0; v < safeFleet; v++) {
          if (usedVehicles.has(v)) continue;
          const vDepot = getVehiclePreset(v, depotBase).depotLocation;
          const d = estimateDrivingDistance(vDepot, cm.centroid);
          if (d < bestDist) {
            bestDist = d;
            bestV = v;
          }
        }
        usedVehicles.add(bestV);
        vehicleBuckets[bestV].push(...cm.stops);
      });

      // Shift-aware balancing within the weekday: if any vehicle exceeds maxShiftMinutes, move boundary stop to under-capacity vehicle
      for (let pass = 0; pass < 8; pass++) {
        let movedAny = false;
        for (let v = 0; v < safeFleet; v++) {
          const vDepot = getVehiclePreset(v, depotBase).depotLocation;
          const m = estimateTourMetrics(vDepot, vehicleBuckets[v], departureMinutes);
          if (m.shiftMin > maxShiftMinutes && vehicleBuckets[v].length > 1) {
            // Find an under-shift vehicle with lowest shift minutes
            let bestTargetV = -1;
            let bestTargetShift = Infinity;
            for (let tv = 0; tv < safeFleet; tv++) {
              if (tv === v) continue;
              const tm = estimateTourMetrics(getVehiclePreset(tv, depotBase).depotLocation, vehicleBuckets[tv], departureMinutes);
              if (tm.shiftMin < maxShiftMinutes - 30 && tm.shiftMin < bestTargetShift) {
                bestTargetShift = tm.shiftMin;
                bestTargetV = tv;
              }
            }
            if (bestTargetV >= 0) {
              const targetDepot = getVehiclePreset(bestTargetV, depotBase).depotLocation;
              let bestStopIdx = 0;
              let bestDist = Infinity;
              vehicleBuckets[v].forEach((st, idx) => {
                const d = estimateDrivingDistance(st.location, targetDepot);
                if (d < bestDist) {
                  bestDist = d;
                  bestStopIdx = idx;
                }
              });
              const [moved] = vehicleBuckets[v].splice(bestStopIdx, 1);
              vehicleBuckets[bestTargetV].push(moved);
              movedAny = true;
            }
          }
        }
        if (!movedAny) break;
      }
    }

    // Optimize tour sequence per vehicle on this weekday
    for (let v = 0; v < safeFleet; v++) {
      const vanId = `van-${v + 1}`;
      const depotLoc = getVehiclePreset(v, depotBase).depotLocation;
      const ordered = optimizeTourSequence(depotLoc, vehicleBuckets[v]);
      ordered.forEach((st, seqIdx) => {
        assignedCustomersMap.set(st.id, {
          ...st,
          assignedWeekday: day,
          weekdayOrder: seqIdx + 1,
          assignedVanId: vanId
        });
      });
    }
  });

  const updatedStops: PetStop[] = allStops.map(s => {
    if (s.id === 'depot') return s;
    return assignedCustomersMap.get(s.id) || s;
  });

  const weekPlan = buildWeekSchedulePlan(updatedStops, safeFleet, departureMinutes, maxShiftMinutes);
  return { updatedStops, weekPlan };
}

/**
 * Builds complete WeekSchedulePlan from stops that already have assignedWeekday & assignedVanId.
 */
export function buildWeekSchedulePlan(
  allStops: PetStop[],
  fleetSize: number = 3,
  departureMinutes: number = 420,
  maxShiftMinutes: number = 540
): WeekSchedulePlan {
  const depotBase = allStops.find(s => s.id === 'depot') || allStops[0];
  const customers = allStops.filter(s => s.id !== 'depot');
  const safeFleet = Math.max(1, Math.min(8, fleetSize));

  const dayRoutes: DayVehicleRoute[] = [];
  const daySummaries = {} as Record<Weekday, DaySummary>;

  let totalWeekDist = 0;
  let totalWeekDriveMin = 0;
  let totalWeekVisits = 0;
  let overShiftCount = 0;

  WEEKDAYS.forEach((weekday) => {
    const dayColor = WEEKDAY_COLORS[weekday];
    let dayDist = 0;
    let dayDriveMin = 0;
    let dayServiceMin = 0;
    let dayVisits = 0;
    let dayRevenue = 0;
    let anyExceeds = false;

    for (let v = 0; v < safeFleet; v++) {
      const meta = getVehiclePreset(v, depotBase);
      const depotStop = makeDepotStop(v, depotBase);

      const rawDayVanStops = customers
        .filter(c => (c.assignedWeekday || 'Monday') === weekday && (c.assignedVanId || 'van-1') === meta.vehicleId)
        .sort((a, b) => (a.weekdayOrder || a.order || 0) - (b.weekdayOrder || b.order || 0));

      const orderedCustomers = optimizeTourSequence(meta.depotLocation, rawDayVanStops);
      const orderedStops = [depotStop, ...orderedCustomers];

      // Build street-interpolated route legs colored by the weekday colour
      const legs: RouteLeg[] = [];
      let vanDist = 0;
      let vanDurSec = 0;

      if (orderedCustomers.length > 0) {
        const fullLoop = [...orderedStops, depotStop];
        for (let i = 0; i < fullLoop.length - 1; i++) {
          const fromS = fullLoop[i];
          const toS = fullLoop[i + 1];
          const isReturn = i === fullLoop.length - 2;
          const dist = estimateDrivingDistance(fromS.location, toS.location);
          const durSec = estimateDrivingDuration(dist);
          vanDist += dist;
          vanDurSec += durSec;

          legs.push({
            fromStopId: fromS.id,
            toStopId: isReturn ? 'depot' : toS.id,
            fromName: fromS.name,
            toName: isReturn ? `${toS.name} (Return)` : toS.name,
            distanceMeters: dist,
            distanceFormatted: formatDistance(dist),
            durationSeconds: durSec,
            durationFormatted: formatDuration(durSec),
            pathCoordinates: densifyPolyline(generateCurvedStreetPoints(fromS.location, toS.location), 18, 40),
            color: dayColor,
            vanId: meta.vehicleId,
            vanLabel: meta.vehicleLabel,
            weekday
          });
        }
      }

      const val = validateTimeWindows(orderedStops, legs, departureMinutes);
      const serviceMin = orderedCustomers.reduce((acc, s) => acc + (s.durationMin || 25), 0);
      const driveMin = Math.round(vanDurSec / 60);
      const shiftMin = orderedCustomers.length > 0 ? Math.max(val.totalShiftMinutes, driveMin + serviceMin) : 0;
      const exceedsShift = shiftMin > maxShiftMinutes;
      const rev = orderedCustomers.reduce((acc, s) => acc + (s.serviceCost || 450), 0);

      if (exceedsShift) {
        anyExceeds = true;
        overShiftCount++;
      }

      dayDist += vanDist;
      dayDriveMin += driveMin;
      dayServiceMin += serviceMin;
      dayVisits += orderedCustomers.length;
      dayRevenue += rev;

      dayRoutes.push({
        weekday,
        vehicleId: meta.vehicleId,
        vehicleLabel: meta.vehicleLabel,
        technicianName: meta.technicianName,
        depotName: meta.depotName,
        depotAddress: meta.depotAddress,
        depotLocation: meta.depotLocation,
        color: dayColor,
        orderedStops,
        legs,
        totalDistanceMeters: vanDist,
        totalDurationSeconds: vanDurSec,
        driveMinutes: driveMin,
        serviceMinutes: serviceMin,
        shiftMinutes: shiftMin,
        returnTime: orderedCustomers.length > 0 ? (val.returnTime || '07:00') : '07:00',
        exceedsShift,
        visitCount: orderedCustomers.length,
        revenue: rev
      });
    }

    daySummaries[weekday] = {
      weekday,
      color: dayColor,
      totalVisits: dayVisits,
      totalDistanceMeters: dayDist,
      totalDriveMinutes: dayDriveMin,
      totalServiceMinutes: dayServiceMin,
      totalRevenue: dayRevenue,
      anyExceedsShift: anyExceeds
    };

    totalWeekDist += dayDist;
    totalWeekDriveMin += dayDriveMin;
    totalWeekVisits += dayVisits;
  });

  return {
    dayRoutes,
    daySummaries,
    totalDistanceMeters: totalWeekDist,
    totalDriveMinutes: totalWeekDriveMin,
    totalVisits: totalWeekVisits,
    overShiftCount
  };
}

/**
 * Moves a customer to another weekday (and optional specific vehicle), re-orders & recalculates the entire week plan.
 */
export function moveStopToWeekday(
  allStops: PetStop[],
  stopId: string,
  targetWeekday: Weekday,
  targetVehicleId: string | undefined,
  fleetSize: number,
  departureMinutes: number,
  maxShiftMinutes: number
): { updatedStops: PetStop[]; weekPlan: WeekSchedulePlan } {
  const currentPlan = buildWeekSchedulePlan(allStops, fleetSize, departureMinutes, maxShiftMinutes);
  const movedStop = allStops.find(s => s.id === stopId);
  if (!movedStop) {
    return { updatedStops: allStops, weekPlan: currentPlan };
  }

  let chosenVanId = targetVehicleId;
  if (!chosenVanId) {
    // Pick the vehicle on targetWeekday whose existing route/depot has best geographic fit without overflowing shift
    const candidateRoutes = currentPlan.dayRoutes.filter(r => r.weekday === targetWeekday);
    let bestVan = movedStop.assignedVanId || 'van-1';
    let bestScore = Infinity;

    candidateRoutes.forEach(r => {
      const refLoc = r.orderedStops.length > 1
        ? r.orderedStops[1].location
        : (r.depotLocation || DEFAULT_DEPOT);
      const distPenalty = estimateDrivingDistance(movedStop.location, refLoc);
      const predictedShift = r.shiftMinutes + (movedStop.durationMin || 25) + 10;
      const shiftPenalty = predictedShift > maxShiftMinutes ? 500000 : predictedShift * 15;
      const score = distPenalty + shiftPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestVan = r.vehicleId;
      }
    });
    chosenVanId = bestVan;
  }

  const nextStops = allStops.map(s => {
    if (s.id !== stopId) return s;
    const freqPrefix = s.weeklyFrequency?.startsWith('Twice Weekly')
      ? `Twice Weekly (${targetWeekday.slice(0, 3)})`
      : s.weeklyFrequency?.startsWith('Fortnightly')
      ? `Fortnightly (${targetWeekday.slice(0, 3)})`
      : `Weekly (${targetWeekday.slice(0, 3)})`;
    return {
      ...s,
      assignedWeekday: targetWeekday,
      assignedVanId: chosenVanId,
      weeklyFrequency: freqPrefix
    };
  });

  // Optimize weekdayOrder across the updated week plan
  const recalculatedPlan = buildWeekSchedulePlan(nextStops, fleetSize, departureMinutes, maxShiftMinutes);
  const orderLookup = new Map<string, number>();
  recalculatedPlan.dayRoutes.forEach(dr => {
    dr.orderedStops.forEach((st, idx) => {
      if (st.id.startsWith('depot')) return;
      orderLookup.set(st.id, idx);
    });
  });

  const finalStops = nextStops.map(s =>
    s.id === 'depot'
      ? s
      : { ...s, weekdayOrder: orderLookup.get(s.id) ?? s.weekdayOrder ?? 1 }
  );

  return { updatedStops: finalStops, weekPlan: recalculatedPlan };
}

/**
 * Parses coordinates or pasted Google Maps pin URLs into { lat, lng }.
 * Supports raw "lat, lng", DMS, "@lat,lng", "!3d<lat>!4d<lng>", "?q=lat,lng", "&ll=lat,lng", etc.
 */
export function parseGoogleMapsPin(rawInput: string): LatLng | null {
  const text = rawInput.trim();
  if (!text) return null;

  // 1. Google Maps accurate pin protobuf coords: !3d-26.1076!4d28.0567
  const protoMatch = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (protoMatch) {
    const lat = parseFloat(protoMatch[1]);
    const lng = parseFloat(protoMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng, altitude: 1500 };
  }

  // 2. Query string coordinates: ?q=-26.1076,28.0567 or &query= or &ll= or &center= or &destination=
  const queryMatch = text.match(/[?&](?:q|query|ll|center|destination|saddr|daddr)=(-?\d+(?:\.\d+)?)[,\s+%2C]+(-?\d+(?:\.\d+)?)/i);
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng, altitude: 1500 };
  }

  // 3. Google Maps URL camera/place center: @-26.1076,28.0567
  const atMatch = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng, altitude: 1500 };
  }

  // 4. DMS format (e.g., 26°06'27.4"S 28°03'24.1"E)
  const dmsRegex = /(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([NS])[\s,;]+(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([EW])/i;
  const dmsMatch = text.match(dmsRegex);
  if (dmsMatch) {
    let lat = parseFloat(dmsMatch[1]) + parseFloat(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
    if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
    let lng = parseFloat(dmsMatch[5]) + parseFloat(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
    if (isValidLatLng(lat, lng)) return { lat, lng, altitude: 1500 };
  }

  // 5. Raw decimal pair: "-26.1076, 28.0567" or "-26.1076 28.0567"
  const rawMatch = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (rawMatch) {
    const lat = parseFloat(rawMatch[1]);
    const lng = parseFloat(rawMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng, altitude: 1500 };
  }

  return null;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function isShortGoogleMapsUrl(input: string): boolean {
  const trimmed = input.trim();
  return /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/\S+/i.test(trimmed);
}

/**
 * Evaluates inserting a candidate customer location into every (weekday, vehicle) route locally
 * using the single cached distance matrix (between new candidate location and existing nodes).
 */
export function evaluateNewCustomerPlacements(params: {
  candidateLocation: LatLng;
  visitDurationMin: number;
  monthlyVisitsCount: number;
  weekPlan: WeekSchedulePlan;
  distancesByNodeId: Record<string, MatrixPairResult>;
  fuelSettings: FuelSettings;
  departureMinutes?: number;
  maxShiftMinutes?: number;
}): {
  top3: PlacementOption[];
  worst: PlacementOption | null;
  allOptions: PlacementOption[];
} {
  const {
    candidateLocation,
    visitDurationMin,
    monthlyVisitsCount,
    weekPlan,
    distancesByNodeId,
    fuelSettings,
    departureMinutes = 420,
    maxShiftMinutes = 540
  } = params;

  const getPairToCandidate = (stop: PetStop): { dist: number; durSec: number } => {
    const direct = distancesByNodeId[stop.id];
    if (direct && direct.distanceMeters > 0) {
      return { dist: direct.distanceMeters, durSec: direct.durationSeconds };
    }
    const dist = estimateDrivingDistance(stop.location, candidateLocation);
    return { dist, durSec: estimateDrivingDuration(dist) };
  };

  const options: PlacementOption[] = [];

  for (const dr of weekPlan.dayRoutes) {
    const routeNodes = dr.orderedStops; // [depotStop, ...customers]
    const depotStop = routeNodes[0];
    if (!depotStop) continue;

    let bestExtraDist = Infinity;
    let bestExtraDurSec = 0;
    let bestInsertIdx = 1;
    let bestInsertAfterName = depotStop.name;

    if (routeNodes.length <= 1) {
      // Empty day/vehicle route: Depot -> Candidate -> Depot
      const toC = getPairToCandidate(depotStop);
      bestExtraDist = toC.dist * 2;
      bestExtraDurSec = toC.durSec * 2;
      bestInsertIdx = 1;
      bestInsertAfterName = `${depotStop.name} (first stop)`;
    } else {
      // Loop through every consecutive edge (from -> to), including final return to depot
      for (let i = 0; i < routeNodes.length; i++) {
        const fromStop = routeNodes[i];
        const toStop = i === routeNodes.length - 1 ? depotStop : routeNodes[i + 1];

        const existingLeg = dr.legs[i];
        const existingDist = existingLeg
          ? existingLeg.distanceMeters
          : estimateDrivingDistance(fromStop.location, toStop.location);
        const existingDurSec = existingLeg
          ? existingLeg.durationSeconds
          : estimateDrivingDuration(existingDist);

        const pairFrom = getPairToCandidate(fromStop);
        const pairTo = getPairToCandidate(toStop);

        const deltaDist = Math.max(0, pairFrom.dist + pairTo.dist - existingDist);
        const deltaDurSec = Math.max(0, pairFrom.durSec + pairTo.durSec - existingDurSec);

        // Pick insertion position minimizing extra distance (tie-break on duration)
        if (
          deltaDist < bestExtraDist - 1 ||
          (Math.abs(deltaDist - bestExtraDist) <= 1 && deltaDurSec < bestExtraDurSec)
        ) {
          bestExtraDist = deltaDist;
          bestExtraDurSec = deltaDurSec;
          bestInsertIdx = i + 1;
          bestInsertAfterName = fromStop.id.startsWith('depot')
            ? `${fromStop.name} (start of shift)`
            : fromStop.name;
        }
      }
    }

    const extraKm = Math.round((bestExtraDist / 1000) * 10) / 10;
    const extraDriveMinutes = Math.max(1, Math.round(bestExtraDurSec / 60));
    const newShiftMinutes = dr.shiftMinutes + extraDriveMinutes + visitDurationMin;
    const fitsShift = newShiftMinutes <= maxShiftMinutes;

    const endTotalMin = departureMinutes + newShiftMinutes;
    const retHrs = Math.floor(endTotalMin / 60) % 24;
    const retMins = Math.round(endTotalMin % 60);
    const newReturnTime = `${String(retHrs).padStart(2, '0')}:${String(retMins).padStart(2, '0')}`;

    const exactExtraKm = bestExtraDist / 1000;
    const perVisitLitres = exactExtraKm * (fuelSettings.fuelConsumptionLPer100Km / 100);
    const perVisitFuelCostZar = perVisitLitres * fuelSettings.fuelPricePerLitre;
    const extraMonthlyFuelCostZar = perVisitFuelCostZar * monthlyVisitsCount;

    options.push({
      weekday: dr.weekday,
      vehicleId: dr.vehicleId,
      vehicleLabel: dr.vehicleLabel,
      technicianName: dr.technicianName,
      insertIndex: bestInsertIdx,
      insertAfterName: bestInsertAfterName,
      extraDistanceMeters: Math.round(bestExtraDist),
      extraKm,
      extraDriveMinutes,
      newShiftMinutes,
      newReturnTime,
      fitsShift,
      perVisitFuelCostZar,
      extraMonthlyFuelCostZar,
      monthlyVisitsCount
    });
  }

  // Sort: shift-fitting options first, then shortest extra distance, then shortest extra drive time
  const sorted = [...options].sort((a, b) => {
    if (a.fitsShift !== b.fitsShift) return a.fitsShift ? -1 : 1;
    if (a.extraDistanceMeters !== b.extraDistanceMeters) {
      return a.extraDistanceMeters - b.extraDistanceMeters;
    }
    return a.extraDriveMinutes - b.extraDriveMinutes;
  });

  // Worst option = highest extra km across all weekday x vehicle options
  const byWorst = [...options].sort((a, b) => b.extraDistanceMeters - a.extraDistanceMeters);

  return {
    top3: sorted.slice(0, 3),
    worst: byWorst[0] || null,
    allOptions: sorted
  };
}
