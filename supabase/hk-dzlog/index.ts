// Hong Kong trip app: records the live Disney queue board (our hk-queue feed + ThemeParks.wiki) into hk_dzlog.
// Called every 5 minutes by pg_cron (x-cron secret) during park hours until 15 Nov, so no computer has to stay on.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const j = async (u: string, h: Record<string, string> = {}) => { try { const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(20000) }); return r.ok ? await r.json() : { err: 'HTTP ' + r.status } } catch (e) { return { err: String((e as Error).message) } } };
Deno.serve(async (req: Request) => {
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
