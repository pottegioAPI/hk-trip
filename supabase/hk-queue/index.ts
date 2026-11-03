// Hong Kong trip app: live ride waits at Hong Kong Disneyland.
// Browsers can't read these feeds directly, so this passes them through (read-only, cached 2 minutes).
// Both sources read the official Hong Kong Disneyland app feed, at different moments: Queue-Times.com polls
// every ~5 minutes, ThemeParks.wiki reports a change within about a minute. Both are read; for each ride the
// most recent reading wins (seen on 3 Nov 2026: Frozen opened on ThemeParks.wiki 3+ minutes before Queue-Times).
// Data: Powered by Queue-Times.com / ThemeParks.wiki
let cache: { at: number; body: string } | null = null;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, content-type, authorization' };
const UA = { 'User-Agent': 'hk-trip-planner (personal trip app)' };
const withTimeout = (p: Promise<Response>, ms: number) => Promise.race([p, new Promise<Response>((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

async function queueTimes() {
  const r = await withTimeout(fetch('https://queue-times.com/parks/31/queue_times.json', { headers: UA }), 8000);
  if (!r.ok) throw new Error('queue-times HTTP ' + r.status);
  const j = await r.json();
  const rides = [...(j.rides || []), ...(j.lands || []).flatMap((l: any) => l.rides || [])]
    .map((x: any) => ({ name: x.name, open: !!x.is_open, wait: x.wait_time, updated: x.last_updated }));
  const newest = Math.max(0, ...rides.map((x: any) => Date.parse(x.updated) || 0));
  if (!rides.length || Date.now() - newest > 15 * 60_000) throw new Error('queue-times stale');
  return rides;
}
async function themeParks() {
  const r = await withTimeout(fetch('https://api.themeparks.wiki/v1/entity/bd0eb47b-2f02-4d4d-90fa-cb3a68988e3b/live', { headers: UA }), 8000);
  if (!r.ok) throw new Error('themeparks HTTP ' + r.status);
  const j = await r.json();
  // lastUpdated there is when the ride's status or number last changed, not when it was read
  const rides = (j.liveData || []).filter((x: any) => x.entityType === 'ATTRACTION' || x.entityType === 'RESTAURANT')
    .map((x: any) => ({ name: x.name, open: x.status === 'OPERATING', wait: (x.queue && x.queue.STANDBY && x.queue.STANDBY.waitTime) || 0, changed: x.lastUpdated }));
  if (!rides.length) throw new Error('themeparks empty');
  return rides;
}

async function both() {
  const [qt, tp] = await Promise.allSettled([queueTimes(), themeParks()]);
  const Q = qt.status === 'fulfilled' ? qt.value : null, T = tp.status === 'fulfilled' ? tp.value : null, now = new Date().toISOString();
  if (!Q && !T) throw new Error('no source answered');
  // ThemeParks.wiki alone: its status is current as of now
  if (!Q) return { source: 'ThemeParks.wiki', rides: T!.map((x: any) => ({ name: x.name, open: x.open, wait: x.wait, updated: now })) };
  if (!T) return { source: 'Queue-Times.com', rides: Q };
  const byName = new Map(T.map((x: any) => [norm(x.name), x]));
  const rides = Q.map((q: any) => {
    const t: any = byName.get(norm(q.name)); if (!t) return q;
    if (t.open === q.open && (t.wait || 0) === (q.wait || 0)) return { ...q, updated: now };   // they agree: true as of now
    // they disagree: whichever changed after the other read is newer. Queue-Times read at q.updated;
    // ThemeParks.wiki changed at t.changed, so if that is later, Queue-Times hasn't caught up yet
    return Date.parse(t.changed) > Date.parse(q.updated) ? { name: q.name, open: t.open, wait: t.wait, updated: now } : q;
  });
  return { source: 'Queue-Times.com + ThemeParks.wiki', rides };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!cache || Date.now() - cache.at > 120_000) {
    try { const out = await both(); cache = { at: Date.now(), body: JSON.stringify({ at: new Date().toISOString(), ...out }) } }
    catch (_) { if (!cache) return new Response(JSON.stringify({ error: 'no source answered' }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }) }
  }
  return new Response(cache!.body, { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60' } });
});
