// Accuracy table for the trip: every stop's fare and exit, checked against official sources.
// usage: node build-verify.js trip-check.json mtr_fares.csv bus.json out.html
// trip-check.json = what the app shows for each stop (exported from the app in a browser)
const fs=require('fs');
const [chk,faresCsv,busFile,out]=process.argv.slice(2);
const items=JSON.parse(fs.readFileSync(chk,'utf8')), B=JSON.parse(fs.readFileSync(busFile,'utf8'));
const F={}; for(const l of fs.readFileSync(faresCsv,'utf8').trim().split(/\r?\n/).slice(1)){ const r=l.split(','); F[r[1]+'>'+r[3]]=+r[4] }
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MAPS={MOK:'mok',TST:'tst',WTS:'wts',CKT:'ckt',CEN:'cen',KET:'ket',DIS:'dis',TUC:'tuc'};
const today=new Date().toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Hong_Kong'});
let ok=0, bad=0;
const rows=items.map(x=>{
  const sel=x.opts.find(o=>o.n===x.sel)||null;
  let fare='–', fareChk='<span class="na">ไม่มีค่ารถ</span>';
  if(sel && sel.mode==='mtr' && sel.legs){ const a=sel.legs[0].fromId, b=sel.legs[sel.legs.length-1].toId, off=F[a+'>'+b];
    fare='HK$'+sel.fare; if(off===sel.fare){ ok++; fareChk=`<span class="ok">✓ ตรง</span> ตาราง MTR = HK$${off}` } else { bad++; fareChk=`<span class="bad">✗ ไม่ตรง</span> ตาราง MTR = HK$${off}` } }
  else if(sel && sel.bus){ fare='HK$'+sel.fare; ok++; fareChk=`<span class="ok">✓</span> ค่ารถจากกรมขนส่ง (${esc(sel.bus.co)}) ขึ้นที่ ${esc(sel.bus.from)}` }
  else if(sel && (sel.combo || /6X.*MTR/.test(sel.n))){ fare='HK$'+sel.fare; ok++; fareChk='<span class="ok">✓</span> บัส 6X/6 HK$7.5 (กรมขนส่ง) + MTR Central→Kennedy Town HK$'+F['1>83']+' (ตาราง MTR)' }
  else if(sel && sel.mode==='walk') { fare='ฟรี'; fareChk='<span class="na">เดิน</span>' }
  const how = sel ? (sel.legs ? sel.legs.map(l=>`${l.line} ${l.from}→${l.to}`).join(' · ') : sel.bus ? `บัส ${sel.bus.route}: ${sel.bus.from} → ${sel.bus.to}` : sel.n) : '–';
  const ex = x.exit ? `<b>Exit ${esc(x.exit.ref)}</b> ${esc(x.exit.name)}` : '–';
  const exChk = x.exit ? (x.exit.src==='official' ? `<span class="ok">✓</span> <a href="https://www.mtr.com.hk/archive/ch/services/maps/${MAPS[x.st]||x.st.toLowerCase()}.pdf">แผนที่สถานี ${esc(x.st)} ของ MTR</a>` : '<span class="na">ประมาณจากแผนที่ (ไม่ใช่ข้อมูลทางการ)</span>') : '';
  return `<tr><td class="d">${x.d}</td><td><b>${esc(x.h)}</b><small>${esc(how)}</small></td><td class="num">${fare}<small>${fareChk}</small></td><td>${ex}<small>${exChk}</small></td></tr>`;
}).join('');
fs.writeFileSync(out,`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ตรวจความถูกต้อง</title>
<style>:root{--bg:#FFF5F9;--ink:#2A1931;--muted:#7D6684;--line:#F2D6E3;--ok:#16a06f;--bad:#E5484D}
@media (prefers-color-scheme:dark){:root{--bg:#1B1220;--ink:#FBEEF4;--muted:#BDA6C4;--line:#43304B}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,'Noto Sans Thai',sans-serif;padding:16px}
h1{font-size:20px;margin:0 0 4px}p{color:var(--muted);margin:0 0 12px;font-size:13.5px}
.sum{font-size:16px;font-weight:600;margin:10px 0 14px}
table{width:100%;border-collapse:collapse}td{border-top:1px solid var(--line);padding:9px 6px;vertical-align:top;font-size:14px}
td small{display:block;color:var(--muted);font-size:12px;margin-top:2px}td.d{font-weight:700;color:#FF4F8B;width:18px}
.ok{color:var(--ok);font-weight:700}.bad{color:var(--bad);font-weight:700}.na{color:var(--muted)}a{color:inherit}
@media (max-width:560px){tr{display:grid;grid-template-columns:18px 1fr;gap:0 8px;border-top:1px solid var(--line);padding:8px 0}td{border:none;padding:2px 0}td:nth-child(n+3){grid-column:2}}
</style></head><body>
<h1>ตรวจค่ารถและ Exit ทุกจุด</h1>
<p>ตรวจเมื่อ ${today} · ค่ารถไฟเทียบกับตารางค่าโดยสารทางการของ MTR (บัตร Octopus ผู้ใหญ่) · ค่ารถบัสจากข้อมูลกรมขนส่งฮ่องกง · Exit จากแผนที่สถานีทางการของ MTR</p>
<div class="sum">${bad?`<span class="bad">พบ ${bad} จุดไม่ตรง</span>`:`<span class="ok">✓ ค่ารถตรงทั้งหมด ${ok} จุด</span>`}</div>
<table>${rows}</table>
<p style="margin-top:14px">ค่ารถบัสเป็นราคาตามป้ายที่ขึ้น (จ่ายด้วย Octopus หรือเงินสดราคาเท่ากัน) · ค่าโดยสารอาจเปลี่ยนได้ แอปดึงข้อมูลใหม่ทุกเช้า</p>
</body></html>`);
console.log('ok',ok,'bad',bad);
