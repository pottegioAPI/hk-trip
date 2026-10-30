// Hong Kong Observatory 9-day forecast (data.weather.gov.hk) → weather.json, baked into the app at refresh time
const fs=require('fs');const [src,out]=process.argv.slice(2);
const j=JSON.parse(fs.readFileSync(src,'utf8'));
if(!Array.isArray(j.weatherForecast)||!j.weatherForecast.length) throw new Error('no forecast in HKO response');
const days=j.weatherForecast.map(f=>({date:f.forecastDate.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'), max:f.forecastMaxtemp&&f.forecastMaxtemp.value, min:f.forecastMintemp&&f.forecastMintemp.value,
  icon:f.ForecastIcon, psr:f.PSR||'', text:(f.forecastWeather||'').slice(0,160)}));
fs.writeFileSync(out, JSON.stringify({updated:j.updateTime||new Date().toISOString(), src:'Hong Kong Observatory 9-day forecast', days}));
console.log('weather days',days.length,days[0].date,'→',days[days.length-1].date);
