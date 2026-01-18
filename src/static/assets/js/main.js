// src/static/assets/js/main.js
// Frontend runtime for Juncta Juvant (browser)
// Populates: dateline, news hero + rail, weather, sports

const TZ = "America/New_York";
const CINCY = { lat: 39.1031, lon: -84.5120 };

function $(id) {
  return document.getElementById(id);
}

function fmtDateline(d = new Date()) {
  // Example: "Cincinnati, Ohio — Sat, Jan 17, 2026"
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
  return `Cincinnati, Ohio — ${parts}`;
}

function fmtNewsTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Example: "1:42 PM" (same-day), else "Jan 17"
  const now = new Date();
  const sameDay =
    d.toLocaleDateString("en-US", { timeZone: TZ }) ===
    now.toLocaleDateString("en-US", { timeZone: TZ });

  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    ...(sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" }),
  }).format(d);
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function weatherCodeToText(code) {
  // Open-Meteo weathercode mapping (condensed)
  const m = new Map([
    [0, "Clear"],
    [1, "Mostly clear"],
    [2, "Partly cloudy"],
    [3, "Overcast"],
    [45, "Fog"],
    [48, "Rime fog"],
    [51, "Light drizzle"],
    [53, "Drizzle"],
    [55, "Heavy drizzle"],
    [56, "Freezing drizzle"],
    [57, "Heavy freezing drizzle"],
    [61, "Light rain"],
    [63, "Rain"],
    [65, "Heavy rain"],
    [66, "Freezing rain"],
    [67, "Heavy freezing rain"],
    [71, "Light snow"],
    [73, "Snow"],
    [75, "Heavy snow"],
    [77, "Snow grains"],
    [80, "Light showers"],
    [81, "Showers"],
    [82, "Heavy showers"],
    [85, "Snow showers"],
    [86, "Heavy snow showers"],
    [95, "Thunderstorm"],
    [96, "Thunderstorm with hail"],
    [99, "Thunderstorm with hail"],
  ]);
  return m.get(Number(code)) || "—";
}

async function loadNews() {
  const list = $("news-list");
  const heroLink = $("hero-link");
  const heroSource = $("hero-source");
  const heroTime = $("hero-time");
  const heroByline = $("hero-byline");
  const heroDesc = $("hero-desc");

  try {
    const r = await fetch("/api/news", { cache: "no-store" });
    if (!r.ok) throw new Error(`news HTTP ${r.status}`);
    const data = await r.json();

    // Hero
    const hero = data?.hero;
    if (hero && heroLink) {
      heroLink.textContent = hero.title || "";
      heroLink.href = hero.link || "#";

      if (heroSource) heroSource.textContent = hero.source || "";
      if (heroTime) heroTime.textContent = fmtNewsTime(hero.pubDate);

      // Byline formatting: only show if exists; prefix with " · By "
      if (heroByline) {
        const b = (hero.byline || "").trim();
        heroByline.textContent = b ? ` · By ${b}` : "";
      }

      if (heroDesc) {
        // Prefer first paragraph if present; fallback to description
        const blurb = (hero.firstParagraph || hero.description || "").trim();
        heroDesc.textContent = blurb;
      }
    }

    // Rail list
    const rail = Array.isArray(data?.rail) ? data.rail : [];
    if (list) {
      if (!rail.length) {
        list.innerHTML = `<li class="muted">No headlines available.</li>`;
        return;
      }

      list.innerHTML = rail
        .map((it) => {
          const title = escapeHtml(it.title || "");
          const href = escapeHtml(it.link || "#");
          const source = escapeHtml(it.source || "");
          const when = escapeHtml(fmtNewsTime(it.pubDate));
          return `
            <li>
              <a href="${href}" target="_blank" rel="noopener">${title}</a>
              <div class="source">${source}${when ? ` · ${when}` : ""}</div>
            </li>
          `.trim();
        })
        .join("");
    }
  } catch (err) {
    if (list) list.innerHTML = `<li class="muted">Couldn’t load headlines.</li>`;
    console.error("News error:", err);
  }
}

async function loadSports() {
  const box = $("sports-content");
  try {
    const r = await fetch("/api/cincy-scores", { cache: "no-store" });
    if (!r.ok) throw new Error(`sports HTTP ${r.status}`);
    const data = await r.json();

    const label = data?.label || "Sports";
    const dateLocal = data?.date_local || "";
    const games = Array.isArray(data?.games) ? data.games : [];

    if (!box) return;

    if (!games.length) {
      box.innerHTML = `<div class="muted">No games found.</div>`;
      return;
    }

    const rows = games
      .map((g) => {
        const teamLabel = escapeHtml(g.teamLabel || "");
        const league = escapeHtml(g.league || "");
        const status = escapeHtml(g.status || "");
        const time = escapeHtml(g.time_local || "");
        const home = escapeHtml(g.home || "");
        const away = escapeHtml(g.away || "");

        const scored =
          g.homeScore != null && g.awayScore != null
            ? `<strong>${away} ${g.awayScore}</strong> at <strong>${home} ${g.homeScore}</strong>`
            : `${away} at ${home}`;

        const metaBits = [teamLabel, league].filter(Boolean).join(" · ");
        const whenBits = [time, status].filter(Boolean).join(" · ");

        return `
          <div class="game">
            <div class="game-line">${scored}</div>
            <div class="source">${metaBits}${metaBits && whenBits ? " · " : ""}${whenBits}</div>
          </div>
        `.trim();
      })
      .join("");

    box.innerHTML = `
      <div class="sports-head">
        <div><strong>${escapeHtml(label)}</strong>${dateLocal ? ` · ${escapeHtml(dateLocal)}` : ""}</div>
      </div>
      ${rows}
    `.trim();
  } catch (err) {
    if (box) box.innerHTML = `<div class="muted">Couldn’t load scores.</div>`;
    console.error("Sports error:", err);
  }
}

async function loadWeather() {
  const tempEl = $("temp");
  const descEl = $("wx-desc");
  const extraEl = $("wx-extra");

  try {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${encodeURIComponent(CINCY.lat)}` +
      `&longitude=${encodeURIComponent(CINCY.lon)}` +
      `&current=temperature_2m,weather_code,wind_speed_10m` +
      `&temperature_unit=fahrenheit` +
      `&wind_speed_unit=mph` +
      `&timezone=${encodeURIComponent(TZ)}`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`weather HTTP ${r.status}`);
    const data = await r.json();

    const cur = data?.current;
    const t = cur?.temperature_2m;
    const wcode = cur?.weather_code;
    const wind = cur?.wind_speed_10m;

    if (tempEl) tempEl.textContent = t != null ? `${Math.round(t)}°` : "—";
    if (descEl) descEl.firstChild
      ? (descEl.firstChild.textContent = weatherCodeToText(wcode))
      : (descEl.textContent = weatherCodeToText(wcode));

    if (extraEl) {
      const windTxt = wind != null ? `Wind ${Math.round(wind)} mph` : "";
      extraEl.textContent = windTxt;
    }
  } catch (err) {
    if (tempEl) tempEl.textContent = "—";
    if (descEl) descEl.innerHTML = `Couldn’t load weather.<br/><small id="wx-extra"></small>`;
    console.error("Weather error:", err);
  }
}

function setDateline() {
  const el = $("dateline");
  if (!el) return;
  el.textContent = fmtDateline(new Date());
}

document.addEventListener("DOMContentLoaded", () => {
  setDateline();
  loadNews();
  loadSports();
  loadWeather();
});
