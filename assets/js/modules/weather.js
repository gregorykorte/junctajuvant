// /assets/js/modules/weather.js
// Weather with icons (Open-Meteo), cached ~1 min

import { TZ, CACHE_TTL_MS } from './config.js';

// Cincinnati fallback if you don't pass coords elsewhere
const LAT = 39.1031, LON = -84.5120;

const API = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  `&current=temperature_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m` +
  `&hourly=temperature_2m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=${encodeURIComponent(TZ)}`;

const CACHE_KEY = 'jj_weather_v2';

// --- SVG sprite -------------------------------------------------------------
function ensureSprite() {
  if (document.getElementById('jj-wx-sprite')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'jj-wx-sprite');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
  <symbol id="icon-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></g></symbol>
  <symbol id="icon-partly" viewBox="0 0 24 24"><circle cx="8" cy="9" r="3"/><path d="M6 16h9a3 3 0 000-6 4.5 4.5 0 00-8 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 16h11a3 3 0 010 6H6a3 3 0 110-6z"/></symbol>
  <symbol id="icon-cloud" viewBox="0 0 24 24"><path d="M6 18h10a4 4 0 000-8 6 6 0 10-12 1" /></symbol>
  <symbol id="icon-fog" viewBox="0 0 24 24"><path d="M5 10h14M3 14h18M5 18h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></symbol>
  <symbol id="icon-drizzle" viewBox="0 0 24 24"><path d="M6 16h10a4 4 0 000-8 6 6 0 10-12 1" /><g stroke="currentColor" stroke-linecap="round"><path d="M8 20l1-2M12 21l1-2M16 20l1-2"/></g></symbol>
  <symbol id="icon-rain" viewBox="0 0 24 24"><path d="M6 14h10a4 4 0 000-8 6 6 0 10-12 1" /><g stroke="currentColor" stroke-linecap="round"><path d="M7 20l1.2-2.2M11 21l1.2-2.2M15 20l1.2-2.2"/></g></symbol>
  <symbol id="icon-showers" viewBox="0 0 24 24"><path d="M6 14h10a4 4 0 000-8 6 6 0 10-12 1" /><g stroke="currentColor" stroke-linecap="round"><path d="M7 19l.7 1.4M10 20l.7 1.4M13 19l.7 1.4M16 20l.7 1.4"/></g></symbol>
  <symbol id="icon-sleet" viewBox="0 0 24 24"><path d="M6 14h10a4 4 0 000-8 6 6 0 10-12 1" /><g stroke="currentColor" stroke-linecap="round"><path d="M8 19l1-1M12 20l1-1M16 19l1-1"/></g><g fill="currentColor"><rect x="7" y="20" width="2" height="2" rx=".5"/><rect x="11" y="21" width="2" height="2" rx=".5"/><rect x="15" y="20" width="2" height="2" rx=".5"/></g></symbol>
  <symbol id="icon-snow" viewBox="0 0 24 24"><path d="M6 14h10a4 4 0 000-8 6 6 0 10-12 1" /><g stroke="currentColor" stroke-linecap="round"><path d="M12 17v4M10 19h4M9.2 18l2.8 2.8M14.8 18L12 20.8"/></g></symbol>
  <symbol id="icon-thunder" viewBox="0 0 24 24"><path d="M6 13h10a4 4 0 000-8 6 6 0 10-12 1" /><path d="M11 14l-2 5 4-2-2 5 6-7h-4l2-4z"/></symbol>
  `;
  document.body.appendChild(svg);
}

function iconFor(code, isDay) {
  // WMO weather codes → icon + label
  // https://open-meteo.com/en/docs#api_form
  const W = Number(code);
  // base labels
  const L = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Freezing fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
    56: 'Light freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Light freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorms', 96: 'Thunderstorms (hail)', 99: 'Violent thunderstorms'
  };

  // pick icon id
  let icon = 'cloud', label = L[W] || '—';
  if (W === 0) icon = 'sun';
  else if (W === 1) icon = isDay ? 'sun' : 'cloud';
  else if (W === 2) icon = 'partly';
  else if (W === 3) icon = 'cloud';
  else if (W === 45 || W === 48) icon = 'fog';
  else if (W >= 51 && W <= 57) icon = 'drizzle';
  else if ((W >= 61 && W <= 67) || (W >= 80 && W <= 82)) icon = (W === 66 || W === 67) ? 'sleet' : (W >= 80 ? 'showers' : 'rain');
  else if ((W >= 71 && W <= 77) || (W >= 85 && W <= 86)) icon = (W === 71 || W === 85) ? 'snow' : 'snow';
  else if (W >= 95 && W <= 99) icon = 'thunder';

  return { icon, label };
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts < Math.min(CACHE_TTL_MS, 60_000)) return data;
  } catch {}
  return null;
}
function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

function render(data) {
  ensureSprite();

  const tempEl = document.getElementById('temp');
  const descEl = document.getElementById('wx-desc');
  const extraEl = document.getElementById('wx-extra');

  if (!tempEl || !descEl || !extraEl) return;

  const { temperature, apparent, wmo, isDay, wind } = data;
  const { icon, label } = iconFor(wmo, isDay);

  tempEl.textContent = Math.round(temperature) + '°';

  const iconSvg = `<svg class="wx-icon" aria-hidden="true"><use href="#icon-${icon}"></use></svg>`;
  descEl.innerHTML = `${iconSvg}${label}<br><small id="wx-extra"></small>`;

  const feels = Math.round(apparent);
  const details = [`Feels ${feels}°`, `Wind ${Math.round(wind)} mph`];
  extraEl.textContent = details.join(' · ');
}

async function fetchWeather() {
  try {
    const res = await fetch(API, { headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error('wx');
    const j = await res.json();
    const cur = j.current || j.current_weather || j.current_units ? j.current : j;
    const data = {
      temperature: cur.temperature_2m ?? cur.temperature ?? 0,
      apparent: cur.apparent_temperature ?? cur.temperature_2m ?? cur.temperature ?? 0,
      wmo: cur.weather_code ?? cur.weathercode ?? 0,
      isDay: (cur.is_day ?? 1) === 1,
      wind: cur.wind_speed_10m ?? cur.windspeed ?? 0
    };
    writeCache(data);
    render(data);
  } catch (e) {
    const cached = readCache();
    if (cached) { render(cached); return; }
    const descEl = document.getElementById('wx-desc');
    if (descEl) descEl.textContent = 'Weather unavailable';
  }
}

export function startWeather() {
  const cached = readCache();
  if (cached) render(cached);
  fetchWeather();
  // refresh roughly once per minute
  setInterval(fetchWeather, 60_000);
}
