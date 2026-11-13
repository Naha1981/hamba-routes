import { LatLng } from '../types';

/**
 * Calculates the great-circle distance between two points on the Earth (in meters)
 */
export function calculateHaversineDistance(p1: LatLng, p2: LatLng): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimates driving distance with city street factor (Manhattan/grid routing multiplier)
 */
export function estimateDrivingDistance(p1: LatLng, p2: LatLng): number {
  const straight = calculateHaversineDistance(p1, p2);
  // Average urban road winding factor ~1.34
  return Math.round(straight * 1.35);
}

/**
 * Estimates driving duration based on city traffic speed (e.g. ~24 km/h average in city traffic)
 */
export function estimateDrivingDuration(distanceMeters: number): number {
  const avgCitySpeedMps = 6.67; // 24 km/h in meters per second
  const baseSeconds = distanceMeters / avgCitySpeedMps;
  // Add 45s for traffic lights per kilometer
  const trafficLightDelay = (distanceMeters / 1000) * 45;
  return Math.max(90, Math.round(baseSeconds + trafficLightDelay));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

/**
 * Decodes Google Maps Encoded Polyline into LatLng array
 */
export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded) return [];
  const poly: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return poly;
}

/**
 * Generates intermediate smooth curved street-like points between two points
 */
export function generateCurvedStreetPoints(start: LatLng, end: LatLng, steps = 60): LatLng[] {
  const points: LatLng[] = [start];
  // Calculate midpoint with perpendicular displacement to simulate realistic city turns
  const midLat = (start.lat + end.lat) / 2;
  const midLng = (start.lng + end.lng) / 2;

  const dx = end.lng - start.lng;
  const dy = end.lat - start.lat;
  const perpOffset = 0.15; // displacement factor

  // Intermediate waypoint corner
  const cornerLat = midLat + -dx * perpOffset;
  const cornerLng = midLng + dy * perpOffset;

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    // Quadratic Bezier interpolation
    const lat = (1 - t) * (1 - t) * start.lat + 2 * (1 - t) * t * cornerLat + t * t * end.lat;
    const lng = (1 - t) * (1 - t) * start.lng + 2 * (1 - t) * t * cornerLng + t * t * end.lng;
    points.push({ lat, lng });
  }
  points.push(end);
  return points;
}

/**
 * Densifies a polyline by interpolating points so that:
 * 1) No adjacent points are further apart than maxSegmentDistanceMeters
 * 2) There are at least minTotalPoints across the leg for silky-smooth van driving animation
 */
export function densifyPolyline(
  points: LatLng[],
  maxSegmentDistanceMeters = 40,
  minTotalPoints = 36
): LatLng[] {
  if (!points || points.length < 2) return points || [];

  // Pass 1: Subdivide any segments longer than maxSegmentDistanceMeters
  const result: LatLng[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dist = estimateDrivingDistance(p1, p2);
    const cuts = Math.max(1, Math.ceil(dist / maxSegmentDistanceMeters));

    for (let c = 1; c <= cuts; c++) {
      const frac = c / cuts;
      result.push({
        lat: p1.lat + (p2.lat - p1.lat) * frac,
        lng: p1.lng + (p2.lng - p1.lng) * frac
      });
    }
  }

  // Pass 2: If the leg is short but has fewer than minTotalPoints, further subdivide
  if (result.length < minTotalPoints && result.length >= 2) {
    const refined: LatLng[] = [result[0]];
    const factor = Math.ceil(minTotalPoints / result.length);
    for (let i = 0; i < result.length - 1; i++) {
      const p1 = result[i];
      const p2 = result[i + 1];
      for (let c = 1; c <= factor; c++) {
        const frac = c / factor;
        refined.push({
          lat: p1.lat + (p2.lat - p1.lat) * frac,
          lng: p1.lng + (p2.lng - p1.lng) * frac
        });
      }
    }
    return refined;
  }

  return result;
}

/**
 * Computes 2D convex hull of LatLng coordinates for route planner territory polygon boundaries
 */
export function computeConvexHull(points: LatLng[]): LatLng[] {
  if (points.length <= 2) return points;

  // Sort points by longitude, then latitude
  const sorted = [...points].sort((a, b) => (a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng));

  const cross = (o: LatLng, a: LatLng, b: LatLng) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

  // Build lower hull
  const lower: LatLng[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: LatLng[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove the last point of each list because it's repeated
  lower.pop();
  upper.pop();

  return lower.concat(upper);
}
