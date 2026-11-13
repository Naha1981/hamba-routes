// Server-side map transport boundary. Provider-specific payloads remain in adapters.
// Do not cache Google matrix results here. Open stack never reads Google matrix data.
export const MAP_PROVIDER=process.env.MAP_PROVIDER==='open'?'open':'google';
let queue:Promise<any>=Promise.resolve();const cache=new Map<string,Response>();
export async function mapsFetch(url:string,options:RequestInit={}){const host=new URL(url).hostname;const google=host==='routes.googleapis.com';if(google&&MAP_PROVIDER!=='google')throw new Error('Google routing data is disabled for the open-map provider.');
 if(google)return fetch(url,options); // No application-level Google content cache.
 const osrm=host==='router.project-osrm.org'||url.startsWith((process.env.OSRM_BASE_URL||'https://router.project-osrm.org').replace(/\/$/,'')+'/');
 if(!osrm)return fetch(url,options); // Coordinate link resolution only, not route data.
 if(process.env.NODE_ENV==='production'&&host==='router.project-osrm.org')throw new Error('Public OSRM demo is non-commercial. Configure an approved production provider.');
 if(cache.has(url))return cache.get(url)!.clone();
 const job=queue.then(async()=>{if(cache.has(url))return cache.get(url)!.clone();await new Promise(r=>setTimeout(r,1200));const res=await fetch(url,options);if(res.status===429)throw new Error('Road service is busy or its free allowance is exhausted. Existing stops are safe. Please wait before trying again.');if(res.ok)cache.set(url,res.clone());return res;});queue=job.catch(()=>{});return job;
                                                                  }
