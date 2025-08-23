import { TZ, CACHE_TTL_MS } from './config.js';

const CACHE_KEY = 'jj_weather_v1';
let inflight = false;

function readCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL_MS) return data;
  }catch{}
  return null;
}
function writeCache(data){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); }catch{}
}

function render(data){
  const t = document.getElementById('temp');
  const d = document.getElementById('wx-desc');
  if (t) t.textContent = `${data.temp}°F`;
  if (d){
    d.innerHTML = `${data.desc}<br><small id="wx-extra"></small>`;
    const x = document.getElementById('wx-extra');
    if (x) x.textContent = `Feels like ${data.feels}°F · Wind ${data.wind} mph`;
  }
}

async function fetchData(){
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude:39.103119, longitude:-84.512016,
    current:'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    temperature_unit:'fahrenheit', windspeed_unit:'mph', timezone:TZ
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather');
  const data = await res.json();
  const c = data.current || {};
  const map = {0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Light freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Light freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Rain showers',82:'Violent rain showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm w/ hail',99:'Thunderstorm w/ hail'};
  return {
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature),
    wind: Math.round(c.wind_speed_10m),
    desc: map[c.weather_code] || '—'
  };
}

async function refresh(){
  if (inflight) return; // avoid overlap
  const cached = readCache();
  if (cached){ render(cached); }
  if (cached) return; // already fresh within TTL
  inflight = true;
  try{ const data = await fetchData(); writeCache(data); render(data); }
  catch{ const d = document.getElementById('wx-desc'); if (d) d.textContent = 'Weather data unavailable.'; }
  finally{ inflight = false; }
}

export function startWeather(){
  refresh();
  setInterval(refresh, CACHE_TTL_MS);
}
