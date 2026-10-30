// Sanity checks a freshly built bus.json before it replaces the published one.
const j=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));
const ok=j.stops.length>8000&&j.routes.length>2000&&j.pats.length>3000&&Object.keys(j.ex||{}).length>=80&&Object.keys(j.stc||{}).length>=90;
console.log('bus.json:',j.stops.length,'stops',j.routes.length,'routes',j.pats.length,'patterns',Object.keys(j.ex||{}).length,'stations with exits');
if(!ok){console.error('bus.json looks incomplete — keeping the old one');process.exit(1)}
