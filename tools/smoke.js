// Test the built site in a real browser before it is published. Runs on GitHub (see .github/workflows/deploy.yml).
// 1) a fresh start on every tab must draw its screen with no script error (catches blank pages)
// 2) the trip simulations (tools/tests/*.js) must pass, in local mode, never touching the real trip data
// usage: node tools/smoke.js [repo root]
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]), f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`, bad = [];
  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' };

  for (const tab of ['home', 'plan', 'go', 'dz', 'money']) {
    const ctx = await browser.newContext(phone), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await ctx.addInitScript(t => { try { if (!localStorage.getItem('hk-tab')) localStorage.setItem('hk-tab', t) } catch (e) {} }, tab);
    await page.goto(base + 'index.html', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    const len = await page.evaluate(t => (document.getElementById('v-' + t) || {}).innerText?.length || 0, tab);
    const line = `เปิดแอปใหม่ที่แท็บ ${tab}: ${len} ตัวอักษร${errs.length ? ' · error: ' + errs.join(' | ') : ''}`;
    console.log((len > 20 && !errs.length ? '✓ ' : '✗ ') + line);
    if (len <= 20 || errs.length) bad.push(line);
    await ctx.close();
  }

  const ctx = await browser.newContext(phone), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(base + 'index.html', { waitUntil: 'load' }); await page.waitForTimeout(2500);
  for (const f of ['tests.js', 'tests2.js', 'tests3.js']) await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'tools', 'tests', f), 'utf8') });
  const rounds = [['round1', 'HKT.round1()'], ['round3', 'HKT.round3()'], ['round4', 'HKT2.round4()'], ['round5', 'HKT2.round5()'], ['random', 'HKT3.round6(60, 31337)']];
  for (const [name, call] of rounds) {
    let res; try { res = await page.evaluate(c => eval(c), call) } catch (e) { res = [{ ok: false, n: 'พัง', m: String(e.message || e) }] }
    const fails = res.filter(x => !x.ok);
    console.log(`${fails.length ? '✗' : '✓'} ทดสอบ ${name}: ${res.length - fails.length}/${res.length} ผ่าน`);
    for (const x of fails) { const l = `${name}: ${x.n} ${x.m || ''}`.trim(); console.log('   ' + l); bad.push(l) }
  }
  if (errs.length) bad.push('script error ระหว่างทดสอบ: ' + [...new Set(errs)].slice(0, 5).join(' | '));
  await browser.close(); server.close();
  if (bad.length) { console.error(`\nไม่ผ่าน ${bad.length} จุด เว็บจะยังไม่เผยแพร่`); process.exit(1) }
  console.log('\nผ่านทั้งหมด');
})().catch(e => { console.error(e); process.exit(1) });
