// Hong Kong trip app: Disney queue history.
//  POST + x-cron  -> records the live queue board (our hk-queue feed + ThemeParks.wiki) into hk_dzlog.
//                    pg_cron calls it every 5 minutes during park hours until 15 Nov, so no computer has to stay on.
//  GET            -> each must-know ride's typical queue per half hour on weekdays (Mon-Fri, like the Disney day),
//                    averaged over every logged day. The app uses it to judge whether a long queue now
//                    will be shorter later today (live board first, this history for the hours ahead).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-cron' };
const j = async (u: string, h: Record<string, string> = {}) => { try { const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(20000) }); return r.ok ? await r.json() : { err: 'HTTP ' + r.status } } catch (e) { return { err: String((e as Error).message) } } };
// ride keys as the app knows them; the 3 Nov import used short names ("Mickey" = PhilharMagic)
const RIDES: [string, RegExp][] = [['frozen', /^Frozen Ever/], ['oaken', /^Wandering Oaken/], ['para', /^Toy Soldier/], ['rc', /^RC Racer/],
  ['grizzly', /^Big Grizzly/], ['manor', /^Mystic Manor/], ['jungle', /^Jungle River/], ['hyper', /^Hyperspace Mountain/],
  ['ironman', /^Iron Man Experience/], ['antman', /^Ant-Man/], ['philhar', /PhilharMagic|^Mickey$/]];
let prof: { at: number; body: string } | null = null;

async function profile() {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {   // a few thousand rows at most; read them in pages
    const { data, error } = await db.from('hk_dzlog').select('at, rides').order('at').range(from, from + 999);
    if (error) throw error; rows.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  // per ride, per day, per half hour: the average reading; then each half hour averaged over the days
  const day: Record<string, Record<string, Record<number, number[]>>> = {};
  for (const r of rows) {
    const t = new Date(Date.parse(r.at) + 8 * 3600e3), dow = t.getUTCDay(); if (dow === 0 || dow === 6) continue;
    const date = t.toISOString().slice(0, 10), slot = Math.floor((t.getUTCHours() * 60 + t.getUTCMinutes()) / 30) * 30;
    for (const [name, wait] of r.rides || []) {
      if (/single rider/i.test(name) || typeof wait !== 'number') continue;
      const k = RIDES.find(([, re]) => re.test(name))?.[0]; if (!k) continue;
      ((day[k] ??= {})[date] ??= {})[slot] ??= []; day[k][date][slot].push(wait);
    }
  }
  const out: Record<string, Record<number, number>> = {}, dates = new Set<string>();
  for (const [k, byDate] of Object.entries(day)) {
    const acc: Record<number, number[]> = {};
    for (const [date, slots] of Object.entries(byDate)) { dates.add(date); for (const [s, v] of Object.entries(slots)) (acc[+s] ??= []).push(v.reduce((a, b) => a + b, 0) / v.length) }
    out[k] = Object.fromEntries(Object.entries(acc).map(([s, v]) => [s, Math.round(v.reduce((a, b) => a + b, 0) / v.length)]));
  }
  return { at: new Date().toISOString(), days: dates.size, dates: [...dates].sort(), prof: out };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method === 'GET') {
    try {
      if (!prof || Date.now() - prof.at > 30 * 60e3) prof = { at: Date.now(), body: JSON.stringify(await profile()) };
      return new Response(prof.body, { headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'max-age=600' } });
    } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }) }
  }
  const { data } = await db.from('hk_config').select('v').eq('k', 'cron_secret').maybeSingle();
  if (!data || req.headers.get('x-cron') !== data.v) return new Response('forbidden', { status: 403 });
  const K = 'sb_publishable_S8yqxmseObhtyqdxmW2A7w_DCyZwPfd';
  const [a, b]: any[] = await Promise.all([
    j(Deno.env.get('SUPABASE_URL') + '/functions/v1/hk-queue', { apikey: K, Authorization: 'Bearer ' + K }),
    j('https://api.themeparks.wiki/v1/entity/bd0eb47b-2f02-4d4d-90fa-cb3a68988e3b/live')]);
  const rides = (a.rides || []).filter((r: any) => r.open).map((r: any) => [r.name, r.wait, r.updated]);
  const wiki = (b.liveData || []).filter((x: any) => x.entityType === 'ATTRACTION').map((x: any) => [x.name, x.status, x.queue?.STANDBY?.waitTime ?? null]);
  const { error } = await db.from('hk_dzlog').insert({ src: a.source || null, err: a.err || b.err || null, rides, wiki });
  return new Response(JSON.stringify({ ok: !error, rides: rides.length, wiki: wiki.length, error: error?.message }), { headers: { 'Content-Type': 'application/json' } });
});
