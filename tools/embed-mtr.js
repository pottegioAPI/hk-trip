// Replaces the MTR data block inside hk-trip.html with a freshly built one, after sanity checks.
const fs=require('fs');const [html,data]=process.argv.slice(2);
const js=fs.readFileSync(data,'utf8').trim();
const MTR=JSON.parse(js.replace(/^const MTR=/,'').replace(/;$/,''));
if(MTR.ids.length<90||Object.keys(MTR.lines).length<9) throw new Error('MTR data looks incomplete: '+MTR.ids.length+' stations');
let t=fs.readFileSync(html,'utf8');
const a=t.indexOf('<script>const MTR='), b=t.indexOf(';</script>',a);
if(a<0||b<0) throw new Error('MTR block not found in '+html);
t=t.slice(0,a)+'<script>'+js.replace(/;$/,'')+t.slice(b);
fs.writeFileSync(html,t);console.log('MTR embedded:',MTR.ids.length,'stations');
