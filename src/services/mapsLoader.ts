import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

export const SOLUTION_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

let initialized = false;

export function hasClientMapsKey(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
}

export function initGoogleMaps(): boolean {
  if (initialized) return true;

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  if (!key) {
    console.warn('Google Maps API key is not configured.');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gmp-map-error', {
          detail: 'Google Maps API key is not configured in the environment. Routes can still be planned using distance estimates.'
        })
      );
    }
    return false;
  }

  try {
    setOptions({
      key,
      v: 'weekly',
      language: 'en',
      region: 'ZA',
      solutionChannel: SOLUTION_ATTRIBUTION_ID,
      libraries: ['maps', 'marker', 'core']
    });
    initialized = true;
    return true;
  } catch (err) {
    console.warn('Google Maps loader initialization warning:', err);
    return false;
  }
}

export async function loadMapsLibrary(name: 'maps' | 'marker' | 'places' | 'geometry' | 'core'): Promise<any> {
  const ready = initGoogleMaps();
  if (!ready) {
    throw new Error('Google Maps API key is not configured in the environment.');
  }
  try {
    return await importLibrary(name as any);
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (msg.toLowerCase().includes('quota') || msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED')) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gmp-map-error', {
          detail: 'Unable to load Google Maps tiles right now. Check your connection or Maps quota and retry.'
        })
      );
    }
    console.warn(`Failed to import Google Maps library "${name}":`, err);
    throw err;
  }
}
