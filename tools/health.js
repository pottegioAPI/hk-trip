// Daily health check: everything the app needs on the trip, checked from outside.
// Any failure makes the GitHub job fail, and GitHub emails the repository owner.
// usage: node tools/health.js
const SITE = 'https://pottegioapi.github.io/hk-trip/';
const SB = 'https://btagqhxhljlbhwwkzghr.supabase.co', KEY = 'sb_publishable_S8yqxmseObhtyqdxmW2A7w_DCyZwPfd';
const hkDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const ageDays = iso => (Date.now() - Date.parse(iso)) / 864e5;
const get = async (url, opt) => { const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(20000) }); return { ok: r.ok, status: r.status, text: await r.text() } };
const json = t => { try { return JSON.parse(t) } catch (e) { return null } };

const checks = [
  ['เว็บไซต์เปิดได้ และมีเวอร์ชัน', async () => {
    const r = await get(SITE + '?h=' + Date.now()); if (!r.ok) return 'HTTP ' + r.status;
    if (r.text.includes("('__APPVER__')")) return 'ไม่มีเลขเวอร์ชัน';
    if (!/<section class="view" id="v-home">/.test(r.text)) return 'หน้าเว็บไม่ครบ';
  }],
  ['ไฟล์ออฟไลน์ (sw.js)', async () => { const r = await get(SITE + 'sw.js?h=' + Date.now()); if (!/VERSION='[0-9a-f]{10}'/.test(r.text)) return 'อ่านเวอร์ชันไม่ได้' }],
  ['คิว Disney สด', async () => {
    const j = json((await get(SB + '/functions/v1/hk-queue')).text);
    if (!j || !Array.isArray(j.rides) || j.rides.length < 10) return 'ได้ข้อมูลไม่ครบ: ' + JSON.stringify(j).slice(0, 120);
  }],
  ['สถานะเที่ยวบิน (สนามบินฮ่องกง)', async () => {
    const j = json((await get(`${SB}/functions/v1/hk-flight?flight=EK384&date=${hkDate()}&arrival=1`)).text);
    if (!j || j.error || !j.found) return 'ไม่พบ EK384 วันนี้: ' + JSON.stringify(j).slice(0, 120);
  }],
  ['ฐานข้อมูลซิงค์ + สำรองข้อมูลเมื่อคืน', async () => {
    const r = await get(SB + '/rest/v1/rpc/hk_health', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: '{}' });
    const j = json(r.text); if (!j || !j.db) return 'ฐานข้อมูลไม่ตอบ: ' + r.text.slice(0, 120);
    if (!j.last_backup || ageDays(j.last_backup) > 1.1) return 'ไม่ได้สำรองข้อมูลเกิน 1 วัน (ล่าสุด ' + j.last_backup + ')';
    for (const [k, on] of Object.entries(j.jobs || {})) if (!on) return 'งานตั้งเวลา ' + k + ' ถูกปิด';
  }],
  ['ข้อมูลอากาศอัปเดต', async () => {
    const j = json((await get(SITE + 'weather.json?h=' + Date.now())).text);
    if (!j || !j.updated || ageDays(j.updated) > 3) return 'ไม่ได้อัปเดตเกิน 3 วัน (' + (j && j.updated) + ')';
  }],
  ['ปฏิทิน Disney วันที่ 16', async () => {
    const j = json((await get(SITE + 'dzcal.json?h=' + Date.now())).text);
    if (!j || j.date !== '2026-11-16' || !j.open) return 'ข้อมูลผิด';
    if (ageDays(j.at) > 4) return 'ไม่ได้อัปเดตเกิน 4 วัน (' + j.at + ')';
  }],
];

(async () => {
  const bad = [];
  for (const [name, fn] of checks) {
    let err; try { err = await fn() } catch (e) { err = String(e && e.message || e) }
    console.log((err ? '✗ ' : '✓ ') + name + (err ? ' — ' + err : ''));
    if (err) bad.push(name + ': ' + err);
  }
  if (bad.length) { console.error('\nระบบมีปัญหา ' + bad.length + ' จุด:\n' + bad.join('\n')); process.exit(1) }
  console.log('\nทุกอย่างปกติ');
})();
