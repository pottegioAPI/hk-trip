// OSM attractions → compact places.json for the in-app place search.
const fs=require('fs');const [osmDir,out]=process.argv.slice(2);
let e=[];for(let i=1;i<=5;i++){const f=osmDir+'/places'+i+'.json';if(fs.existsSync(f))e=e.concat(JSON.parse(fs.readFileSync(f)).elements)}
// Thai names Thai travellers use for well-known places
const TH={'Wong Tai Sin Temple':'วัดหวังต้าเซียน','Che Kung Temple':'วัดแชกงหมิว','Chi Lin Nunnery':'วัดชีหลิน','Man Mo Temple':'วัดหมั่นโหมว',
 "Ten Thousand Buddha's Monastery":'วัดหมื่นพุทธ','Tian Tan Buddha Statue':'พระใหญ่เทียนถาน','Po Lin Monastery':'วัดโป่วหลิน','Ladies Market':'ตลาดเลดี้ส์',
 'Peak Tower':'เดอะพีค (Peak Tower)','Hong Kong Disneyland':'ดิสนีย์แลนด์ฮ่องกง','Ocean Park':'โอเชี่ยนปาร์ค','Avenue of Stars':'อเวนิวออฟสตาร์',
 'Temple Street Night Market':'ตลาดกลางคืนเทมเปิลสตรีท','Repulse Bay Beach':'หาดรีพัลส์เบย์','Nan Lian Garden':'สวนหนานเหลียน','Hong Kong Palace Museum':'พิพิธภัณฑ์พระราชวังฮ่องกง',
 'M+':'พิพิธภัณฑ์ M+','Clock Tower':'หอนาฬิกาจิมซาจุ่ย','Tai O':'หมู่บ้านชาวประมงไทโอ','Stanley Market':'ตลาดสแตนลีย์','Sky100':'สกาย100','Lin Fa Kung':'วัดลินฟ้ากุง',
 'Tin Hau Temple':'ศาลเจ้าแม่ทับทิม (Tin Hau)','Kowloon Walled City Park':'สวนเกาลูนวอลล์ซิตี้','Victoria Peak':'ยอดเขาวิกตอเรีย','Hong Kong Museum of History':'พิพิธภัณฑ์ประวัติศาสตร์ฮ่องกง',
 'Tim Ho Wan':'ติ่มซำทิมโฮวาน',"Mak's Noodle":"บะหมี่เกี๊ยวกุ้ง Mak's",'Australia Dairy Company':'ออสเตรเลียแดรี่ (ไข่คน-พุดดิ้งนม)','Kam Wah Cafe':'คัมวาคาเฟ่ (ขนมปังสับปะรด)',
 'Lan Fong Yuen':'หลานฟงหยวน (ชานมฮ่องกง)','Mammy Pancake':'แมมมี่แพนเค้ก (ขนมไข่ฮ่องกง)','Kau Kee':'เกาคี (บะหมี่เนื้อตุ๋น)','Yat Lok':'ยัตล็อก (ห่านย่าง)','Joy Hing Roasted Meat':'จอยฮิง (หมูแดงย่าง)','Lin Heung Tea House':'ร้านน้ำชาหลินเฮือง (ติ่มซำ)'};
const CUI={dim_sum:'ติ่มซำ',noodle:'ก๋วยเตี๋ยว/บะหมี่',cantonese:'กวางตุ้ง',chinese:'จีน',dessert:'ของหวาน',coffee_shop:'กาแฟ',japanese:'ญี่ปุ่น',thai:'ไทย',korean:'เกาหลี',burger:'เบอร์เกอร์',seafood:'ซีฟู้ด',pizza:'พิซซ่า',italian:'อิตาเลียน',vietnamese:'เวียดนาม',ramen:'ราเมง',sushi:'ซูชิ',bubble_tea:'ชาไข่มุก',tea:'ชา',bakery:'เบเกอรี่',barbecue:'บาร์บีคิว',hot_pot:'หม้อไฟ',congee:'โจ๊ก',roast:'ของย่าง',vegetarian:'มังสวิรัติ',indian:'อินเดีย',western:'ฝรั่ง',hong_kong_style:'ร้านชาฮ่องกง',cha_chaan_teng:'ร้านชาฮ่องกง'};
const cuisine=s=>String(s||'').split(/[;,]/).map(x=>CUI[x.trim()]).filter(Boolean).slice(0,2).join(', ');
const cat=t=>t.amenity==='cafe'?'cafe':t.amenity==='restaurant'||t.amenity==='fast_food'?'food':t.tourism==='theme_park'?'theme':t.tourism==='museum'||t.tourism==='gallery'?'museum':t.tourism==='viewpoint'||t.natural==='peak'?'view':t.tourism==='zoo'||t.tourism==='aquarium'?'zoo':
 t.amenity==='place_of_worship'||t.historic==='temple'?'temple':t.shop==='mall'?'mall':t.amenity==='marketplace'?'market':t.natural==='beach'?'beach':t.leisure==='park'?'park':t.historic?'historic':'sight';
const md=(a,b)=>Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*111320*0.92);
const out_=[];const seen=new Map();
for(const x of e){const t=x.tags||{};const en=(t['name:en']||'').trim();if(!en)continue;const p=[x.lat??(x.center&&x.center.lat),x.lon??(x.center&&x.center.lon)];if(p[0]==null)continue;
 const k=en.toLowerCase();const prev=seen.get(k);if(prev&&prev.some(q=>md(q,p)<400))continue;(seen.get(k)||seen.set(k,[]).get(k)).push(p);
 const fee=t.charge||(t.fee==='no'?'0':'');
 out_.push([en,(t['name:zh']||t.name||'').replace(/\s*[A-Za-z].*$/,'').slice(0,30),TH[en]||t['name:th']||'',Math.round(p[0]*1e5),Math.round(p[1]*1e5),cat(t),t.wikidata?1:0,fee.slice(0,30),cuisine(t.cuisine)])}
out_.sort((a,b)=>b[6]-a[6]);
fs.writeFileSync(out,JSON.stringify({v:new Date().toISOString().slice(0,10),p:out_}));
console.log('places',out_.length,'thai',out_.filter(r=>r[2]).length,'bytes',fs.statSync(out).size);
