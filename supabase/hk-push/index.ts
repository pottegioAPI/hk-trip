// Hong Kong trip app: push notifications to Bank's and J's iPhones.
//  GET                         -> the public VAPID key the app subscribes with
//  POST {test:true, key}       -> a test notification to that person's phones
//  POST {tick:true} + x-cron   -> every 5 min during the trip (pg_cron): send the reminders that are due
//      with the cron secret, {at: ISO} runs the rules as if it were that time and {mock:{warn,queue,mtr}}
//      replaces live data, for testing before the trip
// Each reminder has a kind; a person can turn kinds off in the app (hk_push_prefs).
// The VAPID key pair is created here on first use and kept in hk_config (never leaves the server).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-cron' };
const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SITE = 'https://pottegioapi.github.io/hk-trip/';
const FN = 'https://btagqhxhljlbhwwkzghr.supabase.co/functions/v1/';
type Msg = { title: string; body: string; tag?: string };

async function conf(k: string) { const { data } = await db.from('hk_config').select('v').eq('k', k).maybeSingle(); return data?.v as string | undefined }
async function vapid() {
  let pub = await conf('vapid_pub'), priv = await conf('vapid_priv');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await db.from('hk_config').upsert([{ k: 'vapid_pub', v: k.publicKey }, { k: 'vapid_priv', v: k.privateKey }], { onConflict: 'k', ignoreDuplicates: true });
    pub = await conf('vapid_pub'); priv = await conf('vapid_priv');
  }
  webpush.setVapidDetails(SITE, pub!, priv!);
  return pub!;
}

async function sendTo(uid: string, msg: Msg) {
  const { data: subs } = await db.from('hk_push_subs').select('endpoint, sub, fails').eq('uid', uid);
  let sent = 0; const errors: string[] = [];
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify({ ...msg, url: SITE }), { TTL: 3600, urgency: 'high' });
      sent++; await db.from('hk_push_subs').update({ last_ok: new Date().toISOString(), fails: 0 }).eq('endpoint', s.endpoint);
    } catch (e: any) {
      const code = e?.statusCode; errors.push(String(code || e?.message || e));
      if (code === 404 || code === 410) await db.from('hk_push_subs').delete().eq('endpoint', s.endpoint);   // that phone turned notifications off
      else await db.from('hk_push_subs').update({ fails: (s.fails || 0) + 1 }).eq('endpoint', s.endpoint);
    }
  }
  return { sent, errors };
}
// send once: the id records it so a later tick never repeats it
async function once(id: string, uid: string, msg: Msg) {
  const { error } = await db.from('hk_push_sent').insert({ id: id + '|' + uid });
  if (error) return 0;   // already sent
  return (await sendTo(uid, msg)).sent;
}

const hkAt = (t: number) => { const d = new Date(t + 8 * 3600e3); return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() } };
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) };
const hhmm = (m: number) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const inWin = (now: number, at: number, len = 20) => now >= at && now < at + len;
const getJSON = async (url: string) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); return r.ok ? await r.json() : null } catch (_) { return null } };
const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const TRIP = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'];
const MUST: [string, string, string][] = [['frozen', 'Frozen Ever After', 'Frozen Ever After'], ['rc', 'RC Racer', 'RC Racer'], ['hyper', 'Hyperspace Mountain', 'Hyperspace Mountain'],
  ['grizzly', 'Big Grizzly Mountain Runaway Mine Cars', 'Big Grizzly'], ['ironman', 'Iron Man Experience', 'Iron Man']];
const MTR: [string, string, string][] = [['TWL', 'MOK', 'สายสีแดง Tsuen Wan'], ['KTL', 'MOK', 'สายสีเขียว Kwun Tong'], ['ISL', 'ADM', 'สายสีน้ำเงิน Island'],
  ['TML', 'TAW', 'สาย Tuen Ma'], ['EAL', 'KOT', 'สาย East Rail'], ['TCL', 'TUC', 'สายสีส้ม Tung Chung'], ['DRL', 'SUN', 'สาย Disneyland Resort']];
const WX: Record<string, [string, string]> = {
  TC3: ['🌀 สัญญาณไต้ฝุ่น 3', 'ลมแรง ระวังของปลิว ตัวเที่ยวกลางแจ้งและริมทะเลไว้ก่อน เช็คแอปบ่อยๆ'],
  TC8NE: ['🌀 สัญญาณไต้ฝุ่น 8 (ตะวันออกเฉียงเหนือ)', 'ร้าน รถบัส เรือ และ Disney อาจปิด รีบกลับที่พักด้วย MTR ตอนนี้'],
  TC8SE: ['🌀 สัญญาณไต้ฝุ่น 8 (ตะวันออกเฉียงใต้)', 'ร้าน รถบัส เรือ และ Disney อาจปิด รีบกลับที่พักด้วย MTR ตอนนี้'],
  TC8NW: ['🌀 สัญญาณไต้ฝุ่น 8 (ตะวันตกเฉียงเหนือ)', 'ร้าน รถบัส เรือ และ Disney อาจปิด รีบกลับที่พักด้วย MTR ตอนนี้'],
  TC8SW: ['🌀 สัญญาณไต้ฝุ่น 8 (ตะวันตกเฉียงใต้)', 'ร้าน รถบัส เรือ และ Disney อาจปิด รีบกลับที่พักด้วย MTR ตอนนี้'],
  TC9: ['🌀 สัญญาณไต้ฝุ่น 9', 'อยู่ในที่พัก ห้ามออกไปข้างนอก'],
  TC10: ['🌀 สัญญาณไต้ฝุ่น 10', 'อยู่ในที่พัก ห้ามออกไปข้างนอก ห่างจากหน้าต่าง'],
  WRAINR: ['🌧️ พายุฝนสีแดง', 'ฝนหนักมาก หลบเข้าอาคาร ระวังน้ำท่วมถนน'],
  WRAINB: ['🌧️ พายุฝนสีดำ', 'อยู่ในอาคาร ห้ามออกไปข้างนอกจนกว่าจะยกเลิก'],
};
const WXI: Record<number, string> = { 50: 'แดดจัด', 51: 'แดดเป็นช่วง', 52: 'แดดสลับเมฆ', 53: 'แดดเป็นช่วง มีฝนบ้าง', 54: 'แดดสลับเมฆ มีฝนบ้าง', 60: 'มีเมฆ', 61: 'เมฆมาก', 62: 'ฝนเล็กน้อย', 63: 'ฝนตก', 64: 'ฝนหนัก', 65: 'พายุฝนฟ้าคะนอง', 76: 'เมฆเป็นส่วนใหญ่', 77: 'ส่วนใหญ่อากาศดี' };
const share = (e: any, p: number) => e.kind === 'settle' ? 0 : e.type === 'split' ? e.amt / 2 : e.type === 'adv' ? (e.payer === p ? 0 : e.amt) : (e.payer === p ? e.amt : 0);

// --- EK384 (Dubai → Bangkok → Hong Kong), followed every day 10–14 Nov from live aircraft positions (ADS-B, adsb.lol, free)
// and Hong Kong airport's own schedule. Times are kept as ISO; messages show Thai time (the departure and the Bangkok
// stop are read at home in Thailand). State in hk_config 'ek384' (nothing secret: the app reads it via GET ?ek384=1).
const AP: Record<string, [number, number]> = { DXB: [25.2532, 55.3657], BKK: [13.69, 100.7501], HKG: [22.308, 113.9185] };
const km = (a: [number, number], b: [number, number]) => { const r = Math.PI / 180, x = (b[1] - a[1]) * r * Math.cos((a[0] + b[0]) / 2 * r), y = (b[0] - a[0]) * r; return Math.sqrt(x * x + y * y) * 6371 };
const thTime = (iso: string) => { const d = new Date(Date.parse(iso) + 7 * 3600e3); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') };
const thDate = (t: number) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
async function ekTrack(now: number, mock: any = {}) {
  const st: any = JSON.parse((await conf('ek384')) || '{}'); st.hist = st.hist || {}; const ev: string[] = [];
  const j = mock.adsb || await getJSON('https://api.adsb.lol/v2/callsign/UAE384');
  const a = (j?.ac || [])[0], iso = new Date(now).toISOString();
  let cur = st.cur && now - Date.parse(st.cur.start) < 20 * 3600e3 ? st.cur : null;   // one trip of the aircraft, Dubai to Hong Kong, takes ~11 h
  if (a && a.lat != null) {
    const p: [number, number] = [a.lat, a.lon], ground = a.alt_baro === 'ground', alt = ground ? 0 : Number(a.alt_baro) || 0;
    const dD = km(p, AP.DXB), dB = km(p, AP.BKK), dH = km(p, AP.HKG);
    if (!ground && !cur && dD < dB) {   // in the air on the Dubai leg: a new trip
      cur = { day: thDate(now), start: iso, dxbDep: iso, dxbApprox: dD > 400 }; ev.push('dxbDep');
    }
    if (!ground && !cur && dB < 400 && a.lon > AP.BKK[1]) {   // first seen already leaving Bangkok (the Dubai leg was missed)
      cur = { day: thDate(now), start: iso, dxbDep: null, bkkArr: null, bkkDep: iso }; ev.push('bkkDep');
    }
    if (cur) {
      if (cur.dxbDep && !cur.bkkArr && ground && dB < 30) { cur.bkkArr = iso; ev.push('bkkArr') }
      // in the air east of Bangkok: on the way to Hong Kong (also when the landing in Bangkok was not caught)
      if (cur.dxbDep && !cur.bkkArr && !ground && a.lon > AP.BKK[1] + 0.3) { cur.bkkArr = cur.last?.at || iso; cur.bkkArrApprox = true }
      if (cur.bkkArr && !cur.bkkDep && !ground && dB < 400) { cur.bkkDep = iso; ev.push('bkkDep') }
      if (cur.bkkDep && !cur.hkgArr && ground && dH < 30) { cur.hkgArr = iso; ev.push('hkgArr') }
      cur.last = { lat: a.lat, lon: a.lon, alt, gs: a.gs ?? null, at: iso };
    }
  } else if (cur && cur.last && now - Date.parse(cur.last.at) < 30 * 60e3 && cur.last.alt > 0 && cur.last.alt < 15000) {
    // gone from the air while coming down near an airport: landed (receivers often miss aircraft on the ground);
    // the landing time is the last sighting plus the flying time left at that speed
    const p: [number, number] = [cur.last.lat, cur.last.lon], land = (d: number) => new Date(Date.parse(cur.last.at) + Math.min(20, d / ((cur.last.gs || 250) * 1.852 / 60)) * 60e3).toISOString();
    const dB = km(p, AP.BKK), dH = km(p, AP.HKG);
    if (!cur.bkkArr && dB < 150) { cur.bkkArr = land(dB); ev.push('bkkArr') }
    else if (cur.bkkDep && !cur.hkgArr && dH < 150) { cur.hkgArr = land(dH); ev.push('hkgArr') }
  }
  if (cur) { st.cur = cur; st.hist[cur.day] = { dxbDep: cur.dxbDep, dxbApprox: cur.dxbApprox, bkkArr: cur.bkkArr || null, bkkArrApprox: !!cur.bkkArrApprox, bkkDep: cur.bkkDep || null, hkgArr: cur.hkgArr || null } }
  const days = Object.keys(st.hist).sort(); while (days.length > 7) delete st.hist[days.shift()!];
  st.seen = a ? { at: iso, lat: a.lat, lon: a.lon, alt: a.alt_baro, gs: a.gs ?? null } : st.seen || null; st.checked = iso;
  await db.from('hk_config').upsert({ k: 'ek384', v: JSON.stringify(st) });
  return { st, cur, ev };
}

async function tick(atIso?: string, mock: any = {}) {
  const n = hkAt(atIso ? Date.parse(atIso) : Date.now()), log: string[] = [];
  const now = atIso ? Date.parse(atIso) : Date.now();
  const ekDays = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
  const ek = ekDays.includes(n.date) || (n.date === '2026-11-15' && n.min < 60) ? await ekTrack(now, mock) : null;
  const { data: subs } = await db.from('hk_push_subs').select('uid');
  const uids = [...new Set((subs || []).map((s: any) => s.uid as string))];
  if (!uids.length) return { n, log: ['no subscribers'] };
  const { data: prefs } = await db.from('hk_push_prefs').select('uid, off').in('uid', uids);
  const off = new Map((prefs || []).map((p: any) => [p.uid, new Set(p.off as string[])]));
  const doc = async (path: string) => { const { data } = await db.from('hk_docs').select('data').eq('path', path).eq('deleted', false).maybeSingle(); return (data?.data || null) as any };
  const done: Record<string, any> = (await doc('trip/progress'))?.done || {};
  const tripDay = TRIP.indexOf(n.date) + 1, onTrip = tripDay > 0;
  // R: one message for everyone; P: a message for one person only (money is private)
  const R: { id: string; kind: string; msg: Msg }[] = [], P: { id: string; kind: string; uid: string; msg: Msg }[] = [];
  const at = (date: string, t: string, id: string, kind: string, title: string, body: string, cond = true, len = 20) => { if (n.date === date && cond && inWin(n.min, toMin(t), len)) R.push({ id, kind, msg: { title, body, tag: id } }) };

  // --- before the flight
  at('2026-11-13', '20:00', 'pack', 'pack', '🧳 พรุ่งนี้บินแล้ว!', 'เปิดเช็คลิสต์ก่อนบินในแอป เตรียมของให้ครบ');
  at('2026-11-14', '09:00', 'go-bkk', 'flight', '✈️ วันนี้บิน EK384', 'เครื่องออก 13:45 น. เวลาไทย · ไปให้ถึงสุวรรณภูมิประมาณ 10:45 น.');

  // --- EK384 every day until we fly it: still scheduled? left Dubai? landed in Bangkok?
  if (ek) {
    const c = ek.cur, mine = n.date === '2026-11-14';
    // (only when the airport's schedule could be read: a failed read is tried again at the next tick, never reported as "not found")
    const hk = ekDays.includes(n.date) && n.min >= 8 * 60 && n.min < 22 * 60 ? (mock.hkg !== undefined ? { found: mock.hkg } : await getJSON(`${FN}hk-flight?flight=EK384&date=${n.date}&arrival=1`)) : null;
    if (hk && !hk.error) {
      const f = hk.found;
      const today = c && c.day === thDate(now) ? c : null;
      const body = !f ? 'ไม่พบ EK384 ในตารางสนามบินฮ่องกงวันนี้ ลองเช็คกับ Emirates'
        : /cancel/i.test(String(f.status || '')) ? '❗ สนามบินฮ่องกงแจ้งว่าเที่ยวบินวันนี้ถูกยกเลิก'
        : [`วันนี้ยังบินตามกำหนด ดูไบ → กรุงเทพฯ → ฮ่องกง (ตารางถึงฮ่องกง ${f.time} น. เวลาฮ่องกง)`,
           today && today.dxbDep ? `ออกจากดูไบ ${today.dxbApprox ? 'ราว ' : ''}${thTime(today.dxbDep)} น.` : '',
           today && today.bkkArr ? `ถึงสุวรรณภูมิ ${thTime(today.bkkArr)} น.` : '',
           mine ? 'เที่ยวที่เราบิน: ออกจากสุวรรณภูมิ 13:45 น. · ประตูขึ้นเครื่องและเวลาบอร์ดดิ้งดูบนบอร์ดดิ้งพาสหรือจอในสนามบิน' : ''].filter(Boolean).join(' · ') + (today ? ' (เวลาไทย)' : '');
      R.push({ id: 'ek-daily', kind: 'flight', msg: { title: `📋 EK384 วันนี้ (${+n.date.slice(8)} พ.ย.)`, body, tag: 'ek-daily' } });
    }
    if (c && ek.ev.includes('dxbDep')) R.push({ id: 'ek-dxb-' + c.day, kind: 'flight', msg: { title: '🛫 EK384 ออกจากดูไบแล้ว', body: `ออกเมื่อ${c.dxbApprox ? 'ราว' : ''} ${thTime(c.dxbDep)} น. (เวลาไทย) กำลังบินมากรุงเทพฯ`, tag: 'ek-air' } });
    if (c && ek.ev.includes('bkkDep')) R.push({ id: 'ek-bkkdep-' + c.day, kind: 'flight', msg: { title: '🛫 EK384 ออกจากสุวรรณภูมิแล้ว', body: `ออกเมื่อ ${thTime(c.bkkDep)} น. (เวลาไทย) กำลังบินไปฮ่องกง`, tag: 'ek-air' } });
    if (c && ek.ev.includes('bkkArr')) R.push({ id: 'ek-bkk-' + c.day, kind: 'flight', msg: { title: '🛬 EK384 ถึงสุวรรณภูมิแล้ว', body: `ลงเมื่อ ${thTime(c.bkkArr)} น. (เวลาไทย)${c.day === '2026-11-14' ? ' · เครื่องลำที่เราจะขึ้นมาถึงแล้ว' : ''}`, tag: 'ek-air' } });
  }

  // Disney's own calendar for the Disney day: opening time and the fireworks
  let fwAt = 20 * 60, dzOpen = '10:30';
  if (tripDay >= 3) try { const c = await getJSON(SITE + 'dzcal.json?t=' + Date.now()); const s = (c?.shows || []).find((x: any) => /Momentous|Nighttime/i.test(x.name)); if (s && s.times && s.times.length) fwAt = toMin(s.times[s.times.length - 1]); if (c?.date === '2026-11-16' && c.open) dzOpen = c.open } catch (_) {}
  const dayItems = async (d: number) => ((await doc('plan/d' + d))?.items || []).filter((i: any) => i.t).slice().sort((a: any, b: any) => toMin(a.t) - toMin(b.t));

  // --- every trip morning, 30 min before the day's first stop (not before 06:00): that stop, the weather, an umbrella if it rains
  if ([2, 3, 4].includes(tripDay)) {
    const items = await dayItems(tripDay), first = items[0];
    if (first && inWin(n.min, Math.max(6 * 60, toMin(first.t) - 30))) {
      const w = ((await getJSON(SITE + 'weather.json?t=' + Date.now()))?.days || []).find((d: any) => d.date === n.date);
      const rain = w && (w.icon >= 53 && w.icon <= 65 || /high/i.test(w.psr || ''));
      const parts = [`จุดแรก ${first.t} น. ${first.h}`, w ? `อากาศ ${w.min}–${w.max}° ${WXI[w.icon] || ''}${rain ? ' · พกร่มด้วย ☔' : ''}` : '',
        tripDay === 3 ? `Disney เปิด ${dzOpen} น.` : '', tripDay === 4 ? 'วันนี้เช็คเอาท์ เก็บของให้ครบ แล้วไปฝากกระเป๋าที่ Citygate Outlets (Tung Chung)' : ''].filter(Boolean);
      R.push({ id: 'morning', kind: 'morning', msg: { title: `☀️ อรุณสวัสดิ์ วันที่ ${tripDay} ของทริป`, body: parts.join(' · '), tag: 'morning' } });
    }
  }

  // --- the Disney day: both paid meals, the fireworks, the must-do rides
  at('2026-11-16', '14:30', 'lunch', 'meal', '🍽️ ยังไม่ได้กินมื้อเที่ยง', 'voucher มื้อเที่ยงต้องสั่งก่อน 16:00 น. ไปกินตอนนี้เลย', !(done['dz:lunch'] || done['3l']));
  at('2026-11-16', '18:15', 'dinner', 'meal', '🍽️ ยังไม่ได้กินมื้อเย็น', 'ไปกินตอนนี้จะทันไปจองที่ดูพลุ (voucher แลกได้ถึงประมาณ 19:30 น.)', !(done['dz:dinner'] || done['3n']));
  at('2026-11-16', hhmm(fwAt - 70), 'fw1', 'fireworks', '🎆 อีก 30 นาทีไปจองที่ดูพลุ', `พลุเริ่ม ${hhmm(fwAt)} น. ไปจองที่หน้าปราสาทก่อน ${hhmm(fwAt - 40)} น.`, !done['3c'], 15);
  at('2026-11-16', hhmm(fwAt - 45), 'fw2', 'fireworks', '🎆 ไปที่ดูพลุเลย!', `เดินไปลานหน้าปราสาทตอนนี้ พลุเริ่ม ${hhmm(fwAt)} น.`, !done['3c'], 15);
  if (n.date === '2026-11-16' && n.min >= 10 * 60 + 30 && n.min < fwAt - 40) {
    const q = mock.queue || await getJSON(FN + 'hk-queue');
    const rides = (q?.rides || []).filter((r: any) => !/single rider/i.test(r.name));
    const prev = JSON.parse((await conf('dzstate')) || '{}'), now: Record<string, boolean> = {};
    for (const [k, name, short] of MUST) {
      const r = rides.find((x: any) => norm(x.name).startsWith(norm(name))); if (!r) continue;
      now[k] = !!r.open;
      if (done['dz:' + k]) continue;   // already ridden
      if (r.open && r.wait != null && r.wait <= 15) R.push({ id: `dzw-${k}-${Math.floor(n.min / 90)}`, kind: 'dzwait', msg: { title: `🎢 ${short} รอแค่ ${r.wait} นาที`, body: 'เครื่องห้ามพลาดที่ยังไม่ได้เล่น คิวสั้นตอนนี้ ไปเลย!', tag: 'dzw-' + k } });
      if (n.min >= 11 * 60 && k in prev && prev[k] && !r.open) R.push({ id: `dzdown-${k}-${n.min}`, kind: 'dzstatus', msg: { title: `🔧 ${short} หยุดชั่วคราว`, body: 'อย่าเพิ่งเดินไป แอปเลื่อนไว้ทีหลังให้แล้ว จะเตือนอีกครั้งตอนกลับมาเปิด', tag: 'dzs-' + k } });
      if (n.min >= 11 * 60 && k in prev && !prev[k] && r.open) R.push({ id: `dzup-${k}-${n.min}`, kind: 'dzstatus', msg: { title: `✅ ${short} กลับมาเปิดแล้ว`, body: `ตอนนี้รอ ${r.wait ?? '-'} นาที`, tag: 'dzs-' + k } });
    }
    if (Object.keys(now).length) await db.from('hk_config').upsert({ k: 'dzstate', v: JSON.stringify(now) });
  }

  // --- storms and heavy rain (Hong Kong Observatory), any time during the trip
  if (onTrip || n.date === '2026-11-13') {
    const w = mock.warn || await getJSON('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en');
    for (const v of Object.values(w || {}) as any[]) {
      const c = v && v.code, t = WX[c]; if (!t || v.actionCode === 'CANCEL') continue;
      R.push({ id: `wx-${c}-${v.issueTime || n.date}`, kind: 'weather', msg: { title: t[0], body: t[1], tag: 'wx' } });
    }
  }

  // --- MTR lines the trip uses: delays and service notices
  if (onTrip && n.min >= 7 * 60) {
    for (const [line, sta, name] of MTR) {
      const j = mock.mtr ? (mock.mtr[line] ? { status: 1, isdelay: 'Y' } : { status: 1, isdelay: 'N' }) : await getJSON(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${line}&sta=${sta}`);
      if (!j) continue;
      if (j.isdelay === 'Y' || j.status === 0) R.push({ id: `mtr-${line}-${Math.floor(n.min / 120)}`, kind: 'mtr', msg: { title: `🚇 MTR ${name} มีปัญหา`, body: j.status === 0 && j.message ? String(j.message).slice(0, 140) : 'รถไฟล่าช้า เผื่อเวลาเพิ่ม หรือกด "นำทาง" ในแอปดูทางอื่น', tag: 'mtr-' + line } });
    }
  }

  // --- getting home at night: the last MTR is around midnight
  // (the day's last stop in the plan as it is now, not a fixed one: plans change)
  if ([1, 2, 3].includes(tripDay) && inWin(n.min, 23 * 60 + 10)) {
    const items = await dayItems(tripDay), last = items[items.length - 1];
    at(n.date, '23:10', 'night-' + n.date, 'night', '🚇 ใกล้รถไฟเที่ยวสุดท้ายแล้ว', 'ยังไม่ถึงที่พัก? เปิดแอปดูเวลารถไฟเที่ยวสุดท้ายจากจุดที่อยู่ หรือกด "พากลับที่พัก"', !!last && !done[last.id]);
  }

  // --- the last day: bags, airport (check-out is in that morning's message)
  at('2026-11-17', '16:00', 'bags', 'depart', '🧳 ไปรับกระเป๋าที่ Citygate', 'รับกระเป๋าคืน แล้วนั่งบัส S1 ไปสนามบิน', !done['4e']);
  at('2026-11-17', '16:30', 'to-hkg', 'flight', '✈️ ได้เวลาไปสนามบิน', 'EK385 ออก 21:00 น. เคาน์เตอร์เช็คอินปิดประมาณ 20:00 น.', !done['4e']);

  // --- flights: the airport's own board, while it matters
  const fl = async (no: string, date: string, arrival: boolean) => (await getJSON(`${FN}hk-flight?flight=${no}&date=${date}&arrival=${arrival ? 1 : 0}`))?.found;
  if (n.date === '2026-11-14' && n.min >= 9 * 60 && n.min < 20 * 60) {
    const f = await fl('EK384', n.date, true);
    if (f) { const s = String(f.status || ''), m = s.match(/(\d{1,2}:\d{2})/), d = m ? toMin(m[1]) - toMin(f.time) : 0;
      if (/cancel/i.test(s)) R.push({ id: 'ek384-cancel', kind: 'flight', msg: { title: '❗ EK384 ถูกยกเลิก', body: 'ติดต่อ Emirates ทันที' } });
      else if (d >= 30) R.push({ id: 'ek384-late-' + Math.floor(d / 30), kind: 'flight', msg: { title: `✈️ EK384 ช้า ${d} นาที`, body: `คาดว่าลงฮ่องกง ${m![1]} น. แผนวันแรกในแอปเลื่อนตามให้แล้ว` } });
      if (f.baggage && /gate|landed|arrived/i.test(s)) R.push({ id: 'ek384-belt', kind: 'flight', msg: { title: '🧳 ลงแล้ว รับกระเป๋า', body: `สายพาน ${f.baggage}${f.hall ? ' · Hall ' + f.hall : ''}` } }); }
  }
  if (n.date === '2026-11-17' && n.min >= 15 * 60 && n.min < 21 * 60 + 30) {
    const f = await fl('EK385', n.date, false);
    if (f) { const s = String(f.status || '');
      if (/cancel/i.test(s)) R.push({ id: 'ek385-cancel', kind: 'flight', msg: { title: '❗ EK385 ถูกยกเลิก', body: 'ติดต่อ Emirates ทันที' } });
      if (f.gate) R.push({ id: 'ek385-gate-' + f.gate, kind: 'flight', msg: { title: `✈️ EK385 ประตู ${f.gate}`, body: `เคาน์เตอร์เช็คอินแถว ${f.aisle || '-'} · เครื่องออก 21:00 น.` } });
      if (/board|final/i.test(s)) R.push({ id: 'ek385-board', kind: 'flight', msg: { title: '✈️ EK385 เรียกขึ้นเครื่องแล้ว', body: f.gate ? `ไปที่ประตู ${f.gate} เลย` : 'ไปที่ประตูขึ้นเครื่องเลย' } }); }
  }

  // --- each evening: today's spending against my own daily budget (private: only to that person)
  if (onTrip && inWin(n.min, 21 * 60)) {
    const members = (await doc('trip/members')) || {};
    const { data: shared } = await db.from('hk_docs').select('data').like('path', 'expenses/%').eq('deleted', false);
    for (const u of uids) {
      const me = members.m0 === u ? 0 : members.m1 === u ? 1 : null; if (me == null) continue;
      const budget = Number((await doc(`data/users/${u}/profile`))?.budget) || 0; if (!budget) continue;
      const { data: mine } = await db.from('hk_docs').select('path, data').like('path', `data/users/${u}/%`).eq('deleted', false);
      const all = [...(shared || []).map((r: any) => r.data), ...(mine || []).filter((r: any) => !r.path.endsWith('/profile')).map((r: any) => r.data)];
      const spent = all.filter((e: any) => e && e.day === tripDay).reduce((t: number, e: any) => t + share(e, me), 0), per = budget / 4;
      if (spent > per) P.push({ id: 'budget', kind: 'budget', uid: u, msg: { title: '💰 วันนี้ใช้เกินงบเฉลี่ย', body: `ใช้ไป HK$${Math.round(spent)} จากงบเฉลี่ยวันละ HK$${Math.round(per)} (ส่วนตัว เห็นคนเดียว)`, tag: 'budget' } });
    }
  }

  for (const r of R) for (const u of uids) {
    if (off.get(u)?.has(r.kind)) { log.push(`${r.id} -> ${u}: off`); continue }
    log.push(`${r.id} -> ${u}: ${await once(r.id + '|' + n.date, u, r.msg)}`);
  }
  for (const p of P) { if (off.get(p.uid)?.has(p.kind)) { log.push(`${p.id} -> ${p.uid}: off`); continue } log.push(`${p.id} -> ${p.uid}: ${await once(p.id + '|' + n.date, p.uid, p.msg)}`) }
  return { n, due: [...R.map(r => r.id), ...P.map(p => p.id + '@' + p.uid)], log };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const pub = await vapid();
    if (req.method === 'GET') {
      if (new URL(req.url).searchParams.has('ek384')) { const s = JSON.parse((await conf('ek384')) || '{}'); return out({ hist: s.hist || {}, cur: s.cur || null, seen: s.seen || null, checked: s.checked || null }) }
      return out({ pub });
    }
    const body = await req.json().catch(() => ({}));
    if (body.tick) {
      if (req.headers.get('x-cron') !== await conf('cron_secret')) return out({ error: 'forbidden' }, 403);
      return out(await tick(typeof body.at === 'string' ? body.at : undefined, body.mock || {}));
    }
    if (body.test && typeof body.key === 'string') {
      const { data: m } = await db.from('hk_members').select('uid').eq('key', body.key).maybeSingle();
      if (!m) return out({ error: 'bad key' }, 403);
      const r = await sendTo(m.uid, { title: '🔔 แจ้งเตือนใช้ได้แล้ว', body: 'ระหว่างทริป แอปจะเตือนเรื่องสำคัญให้ แม้ปิดแอปอยู่', tag: 'test' });
      return out({ ok: r.sent > 0, ...r });
    }
    return out({ error: 'unknown request' }, 400);
  } catch (e) { return out({ error: String(e) }, 500) }
});
