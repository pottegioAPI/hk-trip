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

async function tick(atIso?: string, mock: any = {}) {
  const n = hkAt(atIso ? Date.parse(atIso) : Date.now()), log: string[] = [];
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

  // --- every trip morning: the first stop, the weather, an umbrella if it rains
  if ([2, 3, 4].includes(tripDay) && inWin(n.min, 8 * 60)) {
    const items = ((await doc('plan/d' + tripDay))?.items || []).slice().sort((a: any, b: any) => toMin(a.t) - toMin(b.t));
    const w = ((await getJSON(SITE + 'weather.json?t=' + Date.now()))?.days || []).find((d: any) => d.date === n.date);
    const first = items.find((i: any) => !done[i.id]);
    const rain = w && (w.icon >= 53 && w.icon <= 65 || /high/i.test(w.psr || ''));
    const parts = [first ? `เริ่ม ${first.t} น. ${first.h}` : '', w ? `อากาศ ${w.min}–${w.max}° ${WXI[w.icon] || ''}${rain ? ' · พกร่มด้วย ☔' : ''}` : '', tripDay === 3 ? 'Disney เปิด 10:30 น.' : ''].filter(Boolean);
    R.push({ id: 'morning', kind: 'morning', msg: { title: `☀️ อรุณสวัสดิ์ วันที่ ${tripDay} ของทริป`, body: parts.join(' · '), tag: 'morning' } });
  }

  // --- the Disney day: both paid meals, the fireworks, the must-do rides
  let fwAt = 20 * 60; try { const c = await getJSON(SITE + 'dzcal.json?t=' + Date.now()); const s = (c?.shows || []).find((x: any) => /Momentous|Nighttime/i.test(x.name)); if (s && s.times && s.times.length) fwAt = toMin(s.times[s.times.length - 1]) } catch (_) {}
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
  for (const [date, last] of [['2026-11-14', '1c'], ['2026-11-15', '2g'], ['2026-11-16', '3d']]) at(date, '23:10', 'night-' + date, 'night', '🚇 ใกล้รถไฟเที่ยวสุดท้ายแล้ว', 'ยังไม่ถึงที่พัก? เปิดแอปดูเวลารถไฟเที่ยวสุดท้ายจากจุดที่อยู่ หรือกด "พากลับที่พัก"', !done[last]);

  // --- the last day: check-out, bags, airport
  at('2026-11-17', '07:30', 'checkout', 'depart', '🧳 วันนี้เช็คเอาท์', 'เก็บของให้ครบ แล้วไปฝากกระเป๋าที่ Citygate Outlets (Tung Chung)', !done['4a']);
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
    if (req.method === 'GET') return out({ pub });
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
